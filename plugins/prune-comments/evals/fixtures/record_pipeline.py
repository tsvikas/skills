"""
Batch record-processing pipeline for validation, normalization, deduplication, and aggregation.
"""

from typing import Any, Dict, List, Optional, Tuple
from statistics import mean
from copy import deepcopy


class ValidationError(Exception):
    """Raised when record validation fails."""
    pass


class PipelineError(Exception):
    """Raised for pipeline configuration or processing errors."""
    pass


def validate_record(record: Dict[str, Any], schema: Dict[str, Dict[str, Any]]) -> List[str]:
    """
    Validate a single record against a schema.

    Args:
        record: Dictionary to validate.
        schema: Schema defining required fields, types, and constraints.

    Returns:
        List of error messages (empty if valid).
    """
    errors = []

    if not isinstance(record, dict):
        return ["Record is not a dictionary"]

    for field_name, field_spec in schema.items():
        is_required = field_spec.get('required', False)
        field_type = field_spec.get('type')

        if field_name not in record:
            if is_required:
                errors.append(f"Required field '{field_name}' is missing")
            continue

        value = record[field_name]

        if value is None:
            if is_required:
                errors.append(f"Required field '{field_name}' is None")
            continue

        # Type checking
        type_map = {
            'str': str,
            'int': int,
            'float': float,
            'bool': bool,
            'list': list,
            'dict': dict,
        }

        expected_type = type_map.get(field_type)
        if expected_type and not isinstance(value, expected_type):
            errors.append(
                f"Field '{field_name}' has type {type(value).__name__}, "
                f"expected {field_type}"
            )
            continue

        # Range checking for numeric types
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            min_val = field_spec.get('min')
            max_val = field_spec.get('max')

            if min_val is not None and value < min_val:
                errors.append(
                    f"Field '{field_name}' value {value} is less than minimum {min_val}"
                )
            if max_val is not None and value > max_val:
                errors.append(
                    f"Field '{field_name}' value {value} is greater than maximum {max_val}"
                )

    return errors


def normalize_record(record: Dict[str, Any], schema: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """
    Normalize a record by coercing types and filling defaults.

    Args:
        record: Record to normalize.
        schema: Schema with type coercion and default values.

    Returns:
        Normalized record.
    """
    normalized = {}

    for field_name, field_spec in schema.items():
        if field_name not in record:
            default = field_spec.get('default')
            if default is not None:
                normalized[field_name] = deepcopy(default)
            continue

        value = record[field_name]
        if value is None:
            default = field_spec.get('default')
            normalized[field_name] = deepcopy(default) if default is not None else None
            continue

        # Strip whitespace from strings
        if isinstance(value, str):
            value = value.strip()

        # Type coercion
        field_type = field_spec.get('type')
        if field_type == 'int' and isinstance(value, str):
            try:
                value = int(value)
            except ValueError:
                pass
        elif field_type == 'float' and isinstance(value, (str, int)):
            try:
                value = float(value)
            except ValueError:
                pass

        normalized[field_name] = value

    # Preserve fields not in schema
    for key, value in record.items():
        if key not in normalized:
            normalized[key] = value

    return normalized


class Pipeline:
    """
    Batch record-processing pipeline with validation, normalization, deduplication, and aggregation.
    """

    def __init__(
        self,
        schema: Dict[str, Dict[str, Any]],
        dedup_key: Optional[str] = None,
        aggregation_field: Optional[str] = None,
    ):
        """
        Initialize the pipeline.

        Args:
            schema: Field schema for validation and normalization.
            dedup_key: Field to deduplicate by (keeps first occurrence).
            aggregation_field: Numeric field to compute aggregate stats on.

        Raises:
            PipelineError: If schema is empty or invalid.
        """
        if not schema or not isinstance(schema, dict):
            raise PipelineError("Schema must be a non-empty dictionary")

        self.schema = schema
        self.dedup_key = dedup_key
        self.aggregation_field = aggregation_field
        self.records: List[Dict[str, Any]] = []
        self.validation_errors: Dict[int, List[str]] = {}

    def process(
        self,
        records: List[Dict[str, Any]],
        skip_invalid: bool = False,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Process a batch of records through the pipeline.

        Args:
            records: List of record dictionaries to process.
            skip_invalid: If True, skip records that fail validation.

        Returns:
            Tuple of (processed_records, aggregation_stats).

        Raises:
            ValidationError: If skip_invalid is False and any record fails validation.
        """
        if not records:
            return [], self._compute_aggregation([])

        # Validate
        self.validation_errors = {}
        for idx, record in enumerate(records):
            if record is None or not isinstance(record, dict):
                self.validation_errors[idx] = ["Invalid record: not a dictionary"]
                continue

            errors = validate_record(record, self.schema)
            if errors:
                self.validation_errors[idx] = errors

        if self.validation_errors and not skip_invalid:
            raise ValidationError(
                f"Validation failed for {len(self.validation_errors)} record(s)"
            )

        # Filter out invalid records if skipping
        valid_records = [
            record for idx, record in enumerate(records)
            if idx not in self.validation_errors
        ]

        if not valid_records:
            return [], self._compute_aggregation([])

        # Normalize
        normalized = [normalize_record(record, self.schema) for record in valid_records]

        # Deduplicate
        deduplicated = self._deduplicate(normalized)

        self.records = deduplicated

        # Compute aggregation stats
        stats = self._compute_aggregation(deduplicated)

        return deduplicated, stats

    def _deduplicate(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove duplicate records by dedup_key, keeping first occurrence."""
        if not self.dedup_key:
            return records

        seen = set()
        deduplicated = []

        for record in records:
            key_value = record.get(self.dedup_key)

            # Handle None values
            if key_value is None:
                deduplicated.append(record)
                continue

            try:
                if key_value not in seen:
                    seen.add(key_value)
                    deduplicated.append(record)
            except TypeError:
                # Unhashable type, can't deduplicate; include record
                deduplicated.append(record)

        return deduplicated

    def _compute_aggregation(self, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Compute summary statistics on records."""
        stats = {
            'total_count': len(records),
            'min': None,
            'max': None,
            'mean': None,
        }

        if not records or not self.aggregation_field:
            return stats

        values = []
        for record in records:
            value = record.get(self.aggregation_field)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                values.append(value)

        if values:
            stats['min'] = min(values)
            stats['max'] = max(values)
            stats['mean'] = mean(values)

        return stats

    def get_validation_errors(self) -> Dict[int, List[str]]:
        """Return validation errors collected during processing."""
        return self.validation_errors

    def get_processed_records(self) -> List[Dict[str, Any]]:
        """Return the last batch of processed records."""
        return self.records
