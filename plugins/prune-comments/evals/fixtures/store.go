package store

import (
	"sync"
	"sync/atomic"
	"time"
)

// Entry represents a stored value with optional expiration.
type Entry struct {
	Value      interface{}
	ExpiresAt  time.Time
	LastAccess time.Time
}

// Store is a thread-safe in-memory key-value store with TTL and LRU eviction.
type Store struct {
	mu              sync.Mutex
	data            map[string]*Entry
	maxSize         int
	janitorInterval time.Duration
	janitorDone     chan struct{}
	closed          atomic.Bool
}

// Options configures a new Store.
type Options struct {
	MaxSize         int
	JanitorInterval time.Duration
}

// New creates and returns a new Store with the given options.
func New(opts Options) *Store {
	if opts.MaxSize <= 0 {
		opts.MaxSize = 1000
	}
	if opts.JanitorInterval <= 0 {
		opts.JanitorInterval = 1 * time.Second
	}

	s := &Store{
		data:            make(map[string]*Entry),
		maxSize:         opts.MaxSize,
		janitorInterval: opts.JanitorInterval,
		janitorDone:     make(chan struct{}),
	}

	go s.janitor()
	return s
}

// Set stores a value with an optional TTL.
func (s *Store) Set(key string, value interface{}, ttl time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	expiresAt := time.Time{}
	if ttl > 0 {
		expiresAt = now.Add(ttl)
	}

	s.data[key] = &Entry{
		Value:      value,
		ExpiresAt:  expiresAt,
		LastAccess: now,
	}

	// Evict LRU if over capacity.
	if len(s.data) > s.maxSize {
		s.evictLRU()
	}
}

// Get retrieves a value by key, updating its access time.
// Returns (value, true) if found and not expired, (nil, false) otherwise.
func (s *Store) Get(key string) (interface{}, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry, ok := s.data[key]
	if !ok {
		return nil, false
	}

	// Check if expired.
	if !entry.ExpiresAt.IsZero() && time.Now().After(entry.ExpiresAt) {
		delete(s.data, key)
		return nil, false
	}

	// Update access time for LRU.
	entry.LastAccess = time.Now()
	return entry.Value, true
}

// Delete removes a key from the store.
func (s *Store) Delete(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.data, key)
}

// Len returns the number of entries currently in the store.
func (s *Store) Len() int {
	s.mu.Lock()
	defer s.mu.Unlock()

	return len(s.data)
}

// Close stops the janitor goroutine and closes the store.
func (s *Store) Close() error {
	if !s.closed.CompareAndSwap(false, true) {
		return nil // Already closed
	}
	close(s.janitorDone)
	return nil
}

// janitor periodically removes expired entries.
func (s *Store) janitor() {
	ticker := time.NewTicker(s.janitorInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.evictExpired()
		case <-s.janitorDone:
			return
		}
	}
}

// evictExpired removes all expired entries.
func (s *Store) evictExpired() {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	for key, entry := range s.data {
		if !entry.ExpiresAt.IsZero() && now.After(entry.ExpiresAt) {
			delete(s.data, key)
		}
	}
}

// evictLRU removes the least recently used entry.
func (s *Store) evictLRU() {
	var lruKey string
	var lruTime time.Time

	// Find the entry with the earliest last access time.
	for key, entry := range s.data {
		if lruTime.IsZero() || entry.LastAccess.Before(lruTime) {
			lruKey = key
			lruTime = entry.LastAccess
		}
	}

	if lruKey != "" {
		delete(s.data, lruKey)
	}
}
