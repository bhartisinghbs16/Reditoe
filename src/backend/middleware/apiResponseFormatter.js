/**
 * API Response Formatter Middleware
 * Standardizes all API responses to consistent format
 * 
 * Standard Format:
 * {
 *   success: boolean,
 *   message: string,
 *   data: {}
 * }
 */

class ApiResponseFormatter {
  /**
   * Middleware to standardize API responses
   */
  static standardizeResponse() {
    return (req, res, next) => {
      // Override res.json to standardize format
      const originalJson = res.json;
      
      res.json = (data) => {
        // If already standardized, don't double-format
        if (data && typeof data === 'object' && 'success' in data) {
          return originalJson.call(res, data);
        }
        
        // Standardize the response
        const standardizedResponse = {
          success: true,
          message: 'Operation successful',
          data: data || {}
        };
        
        return originalJson.call(res, standardizedResponse);
      };
      
      // Override res.status to maintain chainability
      const originalStatus = res.status;
      res.status = (code) => {
        const result = originalStatus.call(res, code);
        
        // If error status, override json method to return error format
        if (code >= 400) {
          res.json = (data) => {
            const standardizedError = {
              success: false,
              message: (data && data.message) || 'Request failed',
              data: data || {}
            };
            return originalJson.call(res, standardizedError);
          };
        }
        
        return result;
      };
      
      next();
    };
  }

  /**
   * Helper method to create standardized success response
   */
  static success(data = {}, message = 'Operation successful') {
    return {
      success: true,
      message,
      data
    };
  }

  /**
   * Helper method to create standardized error response
   */
  static error(message, data = {}) {
    return {
      success: false,
      message,
      data
    };
  }

  /**
   * Helper method to create standardized validation error response
   */
  static validationError(message, field) {
    return {
      success: false,
      message,
      data: {
        type: 'validation_error',
        field: field || 'unknown'
      }
    };
  }

  /**
   * Helper method to create standardized not found error response
   */
  static notFound(resource = 'Resource') {
    return {
      success: false,
      message: `${resource} not found`,
      data: {
        type: 'not_found_error',
        resource
      }
    };
  }

  /**
   * Helper method to create standardized unauthorized error response
   */
  static unauthorized(message = 'Unauthorized access') {
    return {
      success: false,
      message,
      data: {
        type: 'auth_error',
        code: 'UNAUTHORIZED'
      }
    };
  }
}

export default ApiResponseFormatter;
