/**
 * Priority Task Scheduler with Dependency Resolution
 *
 * Scheduler executes tasks in dependency order while respecting priorities.
 * Features:
 * - Topological sort for dependency resolution
 * - Priority-based execution among ready tasks
 * - Cycle detection with typed errors
 * - Exponential backoff retry mechanism
 * - Cancellation support
 */

/**
 * Represents a task to be scheduled.
 */
interface Task {
  /** Unique identifier for the task */
  id: string;
  /** Execution priority (higher values run first among ready tasks) */
  priority: number;
  /** IDs of tasks that must complete before this task runs */
  dependencies?: string[];
  /** Async function to execute */
  run: () => Promise<void>;
}

/**
 * Result of a task execution.
 */
interface TaskResult {
  /** ID of the completed task */
  taskId: string;
  /** Whether the task succeeded */
  success: boolean;
  /** Error if task failed (undefined if successful) */
  error?: Error;
  /** Number of attempts made */
  attempts: number;
}

/**
 * Configuration options for Scheduler.
 */
interface SchedulerConfig {
  /** Maximum retry attempts per task (default: 3) */
  maxRetries?: number;
  /** Initial backoff delay in milliseconds (default: 100) */
  initialBackoff?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
}

/**
 * Error thrown when a circular dependency is detected.
 */
class CycleDetectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CycleDetectedError';
    Object.setPrototypeOf(this, CycleDetectedError.prototype);
  }
}

/**
 * General scheduler error.
 */
class SchedulerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulerError';
    Object.setPrototypeOf(this, SchedulerError.prototype);
  }
}

/**
 * Priority task scheduler with dependency resolution.
 *
 * Executes tasks respecting dependencies while prioritizing higher-priority tasks
 * among those ready to run. Includes cycle detection, retry logic, and cancellation.
 */
class Scheduler {
  private tasks: Map<string, Task> = new Map();
  private results: Map<string, TaskResult> = new Map();
  private cancelled: boolean = false;
  private maxRetries: number;
  private initialBackoff: number;
  private backoffMultiplier: number;

  /**
   * Creates a new Scheduler instance.
   *
   * @param config - Configuration options for retry and backoff behavior
   */
  constructor(config: SchedulerConfig = {}) {
    this.maxRetries = config.maxRetries ?? 3;
    this.initialBackoff = config.initialBackoff ?? 100;
    this.backoffMultiplier = config.backoffMultiplier ?? 2;
  }

  /**
   * Adds a task to the scheduler.
   *
   * @param task - The task to add
   * @throws SchedulerError if task ID already exists
   */
  addTask(task: Task): void {
    if (this.tasks.has(task.id)) {
      throw new SchedulerError(`Task with ID '${task.id}' already exists`);
    }
    this.tasks.set(task.id, task);
  }

  /**
   * Cancels the scheduler. Pending tasks will not start.
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Detects circular dependencies in the task graph using depth-first search.
   *
   * @throws CycleDetectedError if a cycle is found
   */
  private detectCycles(): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (taskId: string): boolean => {
      visited.add(taskId);
      recursionStack.add(taskId);

      const task = this.tasks.get(taskId);
      if (!task || !task.dependencies) return false;

      for (const depId of task.dependencies) {
        if (!visited.has(depId)) {
          if (hasCycle(depId)) return true;
        } else if (recursionStack.has(depId)) {
          return true;
        }
      }

      recursionStack.delete(taskId);
      return false;
    };

    for (const taskId of this.tasks.keys()) {
      if (!visited.has(taskId)) {
        if (hasCycle(taskId)) {
          throw new CycleDetectedError(
            `Circular dependency detected in task graph (involves task: ${taskId})`
          );
        }
      }
    }
  }

  /**
   * Gets all tasks that are ready to run (all dependencies satisfied).
   * Returns them sorted by priority (highest first).
   *
   * @param completed - Set of already-completed task IDs
   * @returns Array of ready task IDs, sorted by priority descending
   */
  private getReadyTasks(completed: Set<string>): string[] {
    const ready: string[] = [];

    for (const [taskId, task] of this.tasks) {
      if (completed.has(taskId)) continue;

      const deps = task.dependencies || [];
      const allDepsCompleted = deps.every(dep => completed.has(dep));

      if (allDepsCompleted) {
        ready.push(taskId);
      }
    }

    return ready.sort((a, b) => this.tasks.get(b)!.priority - this.tasks.get(a)!.priority);
  }

  /**
   * Executes a task with exponential backoff retry logic.
   *
   * @param task - The task to run
   * @returns TaskResult with success status and attempt count
   */
  private async runWithRetry(task: Task): Promise<TaskResult> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (this.cancelled) {
        return {
          taskId: task.id,
          success: false,
          error: new Error('Task cancelled'),
          attempts: attempt,
        };
      }

      try {
        await task.run();
        return {
          taskId: task.id,
          success: true,
          attempts: attempt,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.maxRetries) {
          const backoffMs = this.initialBackoff * Math.pow(this.backoffMultiplier, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    return {
      taskId: task.id,
      success: false,
      error: lastError,
      attempts: this.maxRetries,
    };
  }

  /**
   * Executes all tasks in dependency and priority order.
   *
   * Respects task dependencies by ensuring a task only runs after all its
   * dependencies complete. Among tasks ready to run, executes higher-priority
   * tasks first. Implements retry logic with exponential backoff.
   *
   * @returns Array of TaskResult for each executed task
   * @throws CycleDetectedError if a circular dependency exists
   * @throws SchedulerError if an unexpected state is reached
   */
  async run(): Promise<TaskResult[]> {
    this.cancelled = false;
    this.results.clear();

    if (this.tasks.size === 0) {
      return [];
    }

    this.detectCycles();

    const completed = new Set<string>();

    while (completed.size < this.tasks.size && !this.cancelled) {
      const ready = this.getReadyTasks(completed);

      if (ready.length === 0) {
        throw new SchedulerError(
          'No ready tasks but not all tasks completed. This indicates a problem with cycle detection.'
        );
      }

      const nextTaskId = ready[0];
      const task = this.tasks.get(nextTaskId)!;
      const result = await this.runWithRetry(task);

      this.results.set(nextTaskId, result);
      completed.add(nextTaskId);
    }

    return Array.from(this.results.values());
  }
}

export { Scheduler, Task, TaskResult, SchedulerConfig, CycleDetectedError, SchedulerError };
