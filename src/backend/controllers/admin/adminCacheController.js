/**
 * Cache Controller for Redis cache management
 * Additive only - does not modify existing functionality
 */
import cacheService from '../../services/cacheService.js';

/**
 * Get cache statistics
 */
export const getCacheStats = async (req, res) => {
  try {
    const stats = await cacheService.getStats();
    
    res.status(200).json({
      status: 'success',
      data: {
        stats
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching cache statistics',
      error: error.message
    });
  }
};

/**
 * Clear cache
 */
export const clearCache = async (req, res) => {
  try {
    const { pattern } = req.query;
    
    let result;
    if (pattern) {
      result = await cacheService.invalidatePattern(pattern);
    } else {
      result = await cacheService.clear();
    }

    res.status(200).json({
      status: 'success',
      message: pattern ? `Cache cleared for pattern: ${pattern}` : 'All cache cleared',
      data: {
        success: result
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error clearing cache',
      error: error.message
    });
  }
};

/**
 * Get cache value
 */
export const getCacheValue = async (req, res) => {
  try {
    const { key } = req.params;
    
    const value = await cacheService.get(key);
    
    if (value === null) {
      return res.status(404).json({
        status: 'error',
        message: 'Cache key not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        key,
        value
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error getting cache value',
      error: error.message
    });
  }
};

/**
 * Set cache value
 */
export const setCacheValue = async (req, res) => {
  try {
    const { key } = req.params;
    const { value, ttl } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'Value is required'
      });
    }

    const result = await cacheService.set(key, value, ttl);
    
    res.status(200).json({
      status: 'success',
      message: 'Cache value set successfully',
      data: {
        key,
        success: result,
        ttl: ttl || cacheService.defaultTTL
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error setting cache value',
      error: error.message
    });
  }
};

/**
 * Delete cache key
 */
export const deleteCacheKey = async (req, res) => {
  try {
    const { key } = req.params;
    
    const result = await cacheService.del(key);
    
    res.status(200).json({
      status: 'success',
      message: result ? 'Cache key deleted successfully' : 'Cache key not found',
      data: {
        key,
        deleted: result
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error deleting cache key',
      error: error.message
    });
  }
};

/**
 * Check if cache key exists
 */
export const checkCacheKey = async (req, res) => {
  try {
    const { key } = req.params;
    
    const exists = await cacheService.exists(key);
    
    res.status(200).json({
      status: 'success',
      data: {
        key,
        exists
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error checking cache key',
      error: error.message
    });
  }
};

/**
 * Warm up cache with common data
 */
export const warmupCache = async (req, res) => {
  try {
    const { types } = req.body; // Array of cache types to warm up
    
    const results = [];
    
    // Warm up analytics cache
    if (!types || types.includes('analytics')) {
      try {
        const { getAnalyticsOverview } = await import('./adminAdvancedAnalyticsController.js');
        
        // Simulate cache warming for common analytics queries
        const cacheKeys = [
          'analytics:overview:daily',
          'analytics:overview:weekly',
          'analytics:profit-breakdown:daily',
          'analytics:trends:daily'
        ];
        
        for (const key of cacheKeys) {
          // Set placeholder data to warm up cache
          await cacheService.set(key, { 
            cached: true, 
            timestamp: new Date(),
            type: 'analytics'
          }, 1800); // 30 minutes
          
          results.push({ key, status: 'warmed' });
        }
      } catch (error) {
        results.push({ type: 'analytics', status: 'error', error: error.message });
      }
    }

    // Warm up user cache
    if (!types || types.includes('users')) {
      try {
        const User = (await import('../../models/User.js')).default;
        const userCount = await User.countDocuments({ role: 'admin' });
        
        await cacheService.set('stats:admin_users_count', userCount, 3600);
        results.push({ key: 'stats:admin_users_count', status: 'warmed', value: userCount });
      } catch (error) {
        results.push({ type: 'users', status: 'error', error: error.message });
      }
    }

    // Warm up order cache
    if (!types || types.includes('orders')) {
      try {
        const Order = (await import('../../models/Order.js')).default;
        const orderCount = await Order.countDocuments({ 
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });
        
        await cacheService.set('stats:orders_today', orderCount, 1800);
        results.push({ key: 'stats:orders_today', status: 'warmed', value: orderCount });
      } catch (error) {
        results.push({ type: 'orders', status: 'error', error: error.message });
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Cache warm-up completed',
      data: {
        results,
        totalWarmed: results.filter(r => r.status === 'warmed').length
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error warming up cache',
      error: error.message
    });
  }
};

/**
 * Get cache performance metrics
 */
export const getCacheMetrics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Get Redis info
    const stats = await cacheService.getStats();
    
    if (!stats.connected) {
      return res.status(503).json({
        status: 'error',
        message: 'Redis not connected'
      });
    }

    // Calculate metrics from Redis info
    const info = stats.info;
    const keyspace = stats.keyspace;

    const metrics = {
      connected: stats.connected,
      memory: {
        used: info.used_memory_human,
        peak: info.peak_memory_human,
        rss: info.used_memory_rss_human
      },
      operations: {
        totalCommands: info.total_commands_processed,
        commandsPerSecond: info.instantaneous_ops_per_sec,
        keySpaceHits: info.keyspace_hits,
        keySpaceMisses: info.keyspace_misses,
        hitRate: info.keyspace_hits && info.keyspace_misses 
          ? ((info.keyspace_hits / (info.keyspace_hits + info.keyspace_misses)) * 100).toFixed(2)
          : 0
      },
      connections: {
        connectedClients: info.connected_clients,
        blockedClients: info.blocked_clients
      },
      keyspace: keyspace,
      uptime: info.uptime_in_seconds,
      version: info.redis_version
    };

    res.status(200).json({
      status: 'success',
      data: {
        metrics,
        period: {
          start: startDate || new Date(Date.now() - 24 * 60 * 60 * 1000),
          end: endDate || new Date()
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching cache metrics',
      error: error.message
    });
  }
};
