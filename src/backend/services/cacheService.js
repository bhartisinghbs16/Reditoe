/**
 * Cache Service for Redis caching
 * Additive only - does not modify existing functionality
 */
import Redis from 'ioredis';

class CacheService {
  constructor() {
    this.redis = null;
    this.isConnected = false;
    this.defaultTTL = 3600; // 1 hour
    this.keyPrefix = 'vinsta:';
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
    
    // Only connect if Redis is explicitly enabled
    if (process.env.REDIS_ENABLED === 'true') {
      this.connect();
    } else {
      console.log('⚠️ Redis caching disabled - Set REDIS_ENABLED=true to enable');
    }
  }

  /**
   * Connect to Redis
   */
  async connect() {
    try {
      this.connectionAttempts++;
      
      if (this.connectionAttempts > this.maxConnectionAttempts) {
        console.log('❌ Max Redis connection attempts reached - disabling Redis');
        return;
      }
      
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.redis = new Redis(redisUrl, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 1, // Reduced retries
        lazyConnect: true,
        connectTimeout: 5000, // 5 second timeout
        commandTimeout: 3000 // 3 second command timeout
      });

      this.redis.on('connect', () => {
        console.log('✅ Redis connected successfully');
        this.isConnected = true;
        this.connectionAttempts = 0; // Reset on successful connection
      });

      this.redis.on('error', (error) => {
        console.error('❌ Redis connection error:', error.message);
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        console.log('🔌 Redis connection closed');
        this.isConnected = false;
      });

      await this.redis.connect();
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error.message);
      this.isConnected = false;
      
      // Don't retry immediately - wait for next attempt
      if (this.connectionAttempts < this.maxConnectionAttempts) {
        setTimeout(() => this.connect(), 5000 * this.connectionAttempts);
      }
    }
  }

  /**
   * Check if Redis is connected
   */
  isReady() {
    return this.isConnected && this.redis && this.redis.status === 'ready';
  }

  /**
   * Generate cache key with prefix
   */
  generateKey(...parts) {
    return this.keyPrefix + parts.join(':');
  }

  /**
   * Set cache value
   */
  async set(key, value, ttl = this.defaultTTL) {
    try {
      if (!this.isReady()) {
        console.warn('Redis not connected, skipping cache set');
        return false;
      }

      const cacheKey = this.generateKey(key);
      const serializedValue = JSON.stringify(value);

      if (ttl > 0) {
        await this.redis.setex(cacheKey, ttl, serializedValue);
      } else {
        await this.redis.set(cacheKey, serializedValue);
      }

      return true;
    } catch (error) {
      console.error('Error setting cache:', error);
      return false;
    }
  }

  /**
   * Get cache value
   */
  async get(key) {
    try {
      if (!this.isReady()) {
        console.warn('Redis not connected, skipping cache get');
        return null;
      }

      const cacheKey = this.generateKey(key);
      const value = await this.redis.get(cacheKey);

      if (value === null) {
        return null;
      }

      return JSON.parse(value);
    } catch (error) {
      console.error('Error getting cache:', error);
      return null;
    }
  }

  /**
   * Delete cache key
   */
  async del(key) {
    try {
      if (!this.isReady()) {
        console.warn('Redis not connected, skipping cache delete');
        return false;
      }

      const cacheKey = this.generateKey(key);
      const result = await this.redis.del(cacheKey);

      return result > 0;
    } catch (error) {
      console.error('Error deleting cache:', error);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    try {
      if (!this.isReady()) {
        return false;
      }

      const cacheKey = this.generateKey(key);
      const result = await this.redis.exists(cacheKey);

      return result === 1;
    } catch (error) {
      console.error('Error checking cache existence:', error);
      return false;
    }
  }

  /**
   * Set cache with expiration
   */
  async setex(key, ttl, value) {
    return this.set(key, value, ttl);
  }

  /**
   * Increment numeric value
   */
  async incr(key, amount = 1) {
    try {
      if (!this.isReady()) {
        console.warn('Redis not connected, skipping cache increment');
        return null;
      }

      const cacheKey = this.generateKey(key);
      
      if (amount === 1) {
        return await this.redis.incr(cacheKey);
      } else {
        return await this.redis.incrby(cacheKey, amount);
      }
    } catch (error) {
      console.error('Error incrementing cache:', error);
      return null;
    }
  }

  /**
   * Decrement numeric value
   */
  async decr(key, amount = 1) {
    try {
      if (!this.isReady()) {
        console.warn('Redis not connected, skipping cache decrement');
        return null;
      }

      const cacheKey = this.generateKey(key);
      
      if (amount === 1) {
        return await this.redis.decr(cacheKey);
      } else {
        return await this.redis.decrby(cacheKey, amount);
      }
    } catch (error) {
      console.error('Error decrementing cache:', error);
      return null;
    }
  }

  /**
   * Get multiple keys
   */
  async mget(keys) {
    try {
      if (!this.isReady()) {
        console.warn('Redis not connected, skipping cache mget');
        return [];
      }

      const cacheKeys = keys.map(key => this.generateKey(key));
      const values = await this.redis.mget(cacheKeys);

      return values.map(value => {
        if (value === null) return null;
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });
    } catch (error) {
      console.error('Error getting multiple cache values:', error);
      return [];
    }
  }

  /**
   * Set multiple keys
   */
  async mset(keyValuePairs, ttl = this.defaultTTL) {
    try {
      if (!this.isReady()) {
        console.warn('Redis not connected, skipping cache mset');
        return false;
      }

      const pipeline = this.redis.pipeline();
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const cacheKey = this.generateKey(key);
        const serializedValue = JSON.stringify(value);
        
        if (ttl > 0) {
          pipeline.setex(cacheKey, ttl, serializedValue);
        } else {
          pipeline.set(cacheKey, serializedValue);
        }
      }

      await pipeline.exec();
      return true;
    } catch (error) {
      console.error('Error setting multiple cache values:', error);
      return false;
    }
  }

  /**
   * Clear all cache with prefix
   */
  async clear() {
    try {
      if (!this.isReady()) {
        console.warn('Redis not connected, skipping cache clear');
        return false;
      }

      const pattern = this.generateKey('*');
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
      }

      return true;
    } catch (error) {
      console.error('Error clearing cache:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      if (!this.isReady()) {
        return {
          connected: false,
          info: null
        };
      }

      const info = await this.redis.info();
      const keyspace = await this.redis.info('keyspace');

      return {
        connected: true,
        info: this.parseRedisInfo(info),
        keyspace: this.parseRedisInfo(keyspace)
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Parse Redis INFO output
   */
  parseRedisInfo(info) {
    const lines = info.split('\r\n');
    const result = {};

    for (const line of lines) {
      if (line.startsWith('#') || line === '') continue;
      
      const [key, value] = line.split(':');
      if (key && value) {
        result[key] = isNaN(value) ? value : Number(value);
      }
    }

    return result;
  }

  /**
   * Cache middleware for Express
   */
  middleware(options = {}) {
    const {
      ttl = this.defaultTTL,
      keyGenerator = (req) => `${req.method}:${req.originalUrl}`,
      condition = () => true,
      skipCache = false
    } = options;

    return async (req, res, next) => {
      if (skipCache || !condition(req) || !this.isReady()) {
        return next();
      }

      const cacheKey = keyGenerator(req);
      
      try {
        const cachedResponse = await this.get(cacheKey);
        
        if (cachedResponse) {
          // Set cache headers
          res.set('X-Cache', 'HIT');
          res.set('X-Cache-Key', cacheKey);
          
          return res.json(cachedResponse);
        }

        // Override res.json to cache the response
        const originalJson = res.json;
        res.json = function(data) {
          // Only cache successful responses
          if (res.statusCode >= 200 && res.statusCode < 300) {
            CacheService.set(cacheKey, data, ttl).catch(error => {
              console.error('Error caching response:', error);
            });
          }
          
          res.set('X-Cache', 'MISS');
          res.set('X-Cache-Key', cacheKey);
          
          return originalJson.call(this, data);
        };

        next();
      } catch (error) {
        console.error('Cache middleware error:', error);
        next();
      }
    };
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern) {
    try {
      if (!this.isReady()) {
        console.warn('Redis not connected, skipping cache invalidation');
        return false;
      }

      const fullPattern = this.generateKey(pattern);
      const keys = await this.redis.keys(fullPattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`Invalidated ${keys.length} cache keys matching pattern: ${pattern}`);
      }

      return true;
    } catch (error) {
      console.error('Error invalidating cache pattern:', error);
      return false;
    }
  }

  /**
   * Cache query results with automatic invalidation
   */
  async cacheQuery(key, queryFn, ttl = this.defaultTTL) {
    try {
      // Try to get from cache first
      const cached = await this.get(key);
      if (cached !== null) {
        return cached;
      }

      // Execute query and cache result
      const result = await queryFn();
      await this.set(key, result, ttl);
      
      return result;
    } catch (error) {
      console.error('Error in cache query:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    try {
      if (this.redis) {
        await this.redis.disconnect();
        this.isConnected = false;
        console.log('Redis disconnected');
      }
    } catch (error) {
      console.error('Error disconnecting from Redis:', error);
    }
  }
}

// Export singleton instance
export default new CacheService();
