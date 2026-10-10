/**
 * Rider Incentives Controller
 * Handles incentive progress tracking and claiming
 */

import IncentiveService from '../services/incentiveService.js';
import RiderIncentiveProgress from '../models/RiderIncentiveProgress.js';
import IncentiveTemplate from '../models/IncentiveTemplate.js';

/**
 * Get rider incentives
 * GET /api/rider/incentives
 */
export const getRiderIncentives = async (req, res) => {
  try {
    const riderId = req.riderId;
    
    const activeIncentives = await IncentiveService.getActiveIncentives(riderId);
    
    res.status(200).json({
      status: 'success',
      data: activeIncentives,
      message: 'Active incentives retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting rider incentives:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch incentives',
    });
  }
};

/**
 * Get incentive progress details
 * GET /api/rider/incentives/:id/progress
 */
export const getIncentiveProgress = async (req, res) => {
  try {
    const riderId = req.riderId;
    const { id } = req.params;
    
    // Get specific progress record
    const progress = await RiderIncentiveProgress.findOne({
      riderId,
      _id: id
    }).populate('templateId');
    
    if (!progress) {
      return res.status(404).json({
        status: 'error',
        message: 'Incentive progress not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: progress,
      message: 'Progress details retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting incentive progress:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch progress details',
    });
  }
};

/**
 * Claim incentive
 * POST /api/rider/incentives/:id/claim
 */
export const claimIncentive = async (req, res) => {
  try {
    const riderId = req.riderId;
    const { id } = req.params;
    
    const result = await IncentiveService.checkIncentiveCompletion(riderId, id);
    
    if (result.completed) {
      res.status(200).json({
        status: 'success',
        data: result.progress,
        message: 'Incentive claimed successfully!'
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: 'Incentive cannot be claimed',
        data: result.progress
      });
    }
  } catch (error) {
    console.error('Error claiming incentive:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to claim incentive',
    });
  }
};

/**
 * Get incentive history
 * GET /api/rider/incentives/history
 */
export const getIncentiveHistory = async (req, res) => {
  try {
    const riderId = req.riderId;
    const { limit = 50 } = req.query;
    
    const history = await IncentiveService.getProgressHistory(riderId, limit);
    
    res.status(200).json({
      status: 'success',
      data: history,
      message: 'Incentive history retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting incentive history:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch incentive history',
    });
  }
};

/**
 * Get available incentive templates (for admin use)
 * GET /api/rider/incentives/templates
 */
export const getIncentiveTemplates = async (req, res) => {
  try {
    const templates = await IncentiveTemplate.getActiveTemplates();
    
    res.status(200).json({
      status: 'success',
      data: templates,
      message: 'Incentive templates retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting incentive templates:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch incentive templates',
    });
  }
};
