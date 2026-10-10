/**
 * Backup Controller for MongoDB backup and recovery
 * Additive only - does not modify existing functionality
 */
import Backup from '../../models/Backup.js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get all backups with pagination
 */
export const getBackups = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, organizationId } = req.query;
    
    let filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (organizationId) filter.organizationId = organizationId;
    
    const backups = await Backup.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('execution.triggeredBy', 'name email')
      .populate('organizationId', 'name slug');
    
    const total = await Backup.countDocuments(filter);
    
    res.status(200).json({
      status: 'success',
      data: {
        backups,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching backups',
      error: error.message
    });
  }
};

/**
 * Create a new backup job
 */
export const createBackup = async (req, res) => {
  try {
    const {
      type = 'manual',
      description,
      config,
      storage,
      retention,
      schedule,
      tags
    } = req.body;
    
    const backup = new Backup({
      type,
      description,
      config: {
        includeCollections: config?.includeCollections || ['*'],
        excludeCollections: config?.excludeCollections || [],
        compress: config?.compress !== false,
        encryption: config?.encryption || { enabled: false, algorithm: 'AES256' }
      },
      storage: {
        type: storage?.type || 'local',
        config: storage?.config || {
          path: path.join(__dirname, '../../backups')
        }
      },
      retention: {
        days: retention?.days || 30,
        autoDelete: retention?.autoDelete !== false
      },
      schedule: schedule || {
        frequency: 'once',
        nextRun: null,
        cronExpression: null
      },
      tags: tags || [],
      organizationId: req.user.organizationId || null
    });
    
    await backup.save();
    
    // If it's a manual backup, start it immediately
    if (type === 'manual') {
      executeBackup(backup._id, req.user._id);
    }
    
    res.status(201).json({
      status: 'success',
      data: {
        backup
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error creating backup',
      error: error.message
    });
  }
};

/**
 * Trigger manual backup
 */
export const triggerBackup = async (req, res) => {
  try {
    const { id } = req.params;
    
    const backup = await Backup.findById(id);
    if (!backup) {
      return res.status(404).json({
        status: 'error',
        message: 'Backup not found'
      });
    }
    
    if (backup.status === 'running') {
      return res.status(400).json({
        status: 'error',
        message: 'Backup is already running'
      });
    }
    
    // Start the backup
    await backup.start(req.user._id);
    
    // Execute backup asynchronously
    executeBackup(backup._id, req.user._id);
    
    res.status(200).json({
      status: 'success',
      message: 'Backup triggered successfully',
      data: {
        backup
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error triggering backup',
      error: error.message
    });
  }
};

/**
 * Cancel a running backup
 */
export const cancelBackup = async (req, res) => {
  try {
    const { id } = req.params;
    
    const backup = await Backup.findById(id);
    if (!backup) {
      return res.status(404).json({
        status: 'error',
        message: 'Backup not found'
      });
    }
    
    if (backup.status !== 'running' && backup.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot cancel backup. Backup is not running.'
      });
    }
    
    await backup.cancel();
    
    res.status(200).json({
      status: 'success',
      message: 'Backup cancelled successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error cancelling backup',
      error: error.message
    });
  }
};

/**
 * Delete a backup
 */
export const deleteBackup = async (req, res) => {
  try {
    const { id } = req.params;
    
    const backup = await Backup.findById(id);
    if (!backup) {
      return res.status(404).json({
        status: 'error',
        message: 'Backup not found'
      });
    }
    
    if (backup.status === 'running') {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete running backup. Cancel it first.'
      });
    }
    
    // Delete backup file if it exists
    if (backup.results.location && fs.existsSync(backup.results.location)) {
      fs.unlinkSync(backup.results.location);
    }
    
    await Backup.findByIdAndDelete(id);
    
    res.status(200).json({
      status: 'success',
      message: 'Backup deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error deleting backup',
      error: error.message
    });
  }
};

/**
 * Get backup statistics
 */
export const getBackupStats = async (req, res) => {
  try {
    const { organizationId } = req.query;
    
    let filter = {};
    if (organizationId) filter.organizationId = organizationId;
    
    const [
      totalBackups,
      completedBackups,
      failedBackups,
      runningBackups,
      scheduledBackups
    ] = await Promise.all([
      Backup.countDocuments(filter),
      Backup.countDocuments({ ...filter, status: 'completed' }),
      Backup.countDocuments({ ...filter, status: 'failed' }),
      Backup.countDocuments({ ...filter, status: 'running' }),
      Backup.countDocuments({ 
        ...filter, 
        'schedule.frequency': { $ne: 'once' },
        status: { $in: ['pending', 'completed'] }
      })
    ]);
    
    // Get storage usage
    const completedBackupDocs = await Backup.find({ 
      ...filter, 
      status: 'completed',
      'results.fileSize': { $exists: true }
    }).select('results.fileSize');
    
    const totalStorage = completedBackupDocs.reduce((sum, backup) => 
      sum + (backup.results.fileSize || 0), 0
    );
    
    // Get recent activity
    const recentBackups = await Backup.find(filter)
      .sort({ createdAt: -1 })
      .limit(5)
      .select('type status description createdAt execution.duration results.fileSize')
      .populate('execution.triggeredBy', 'name');
    
    res.status(200).json({
      status: 'success',
      data: {
        stats: {
          totalBackups,
          completedBackups,
          failedBackups,
          runningBackups,
          scheduledBackups,
          successRate: totalBackups > 0 ? (completedBackups / totalBackups) * 100 : 0,
          totalStorage,
          averageBackupSize: completedBackups > 0 ? totalStorage / completedBackups : 0
        },
        recentActivity: recentBackups
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching backup statistics',
      error: error.message
    });
  }
};

/**
 * Download backup file
 */
export const downloadBackup = async (req, res) => {
  try {
    const { id } = req.params;
    
    const backup = await Backup.findById(id);
    if (!backup) {
      return res.status(404).json({
        status: 'error',
        message: 'Backup not found'
      });
    }
    
    if (backup.status !== 'completed') {
      return res.status(400).json({
        status: 'error',
        message: 'Backup is not completed yet'
      });
    }
    
    if (!backup.results.location || !fs.existsSync(backup.results.location)) {
      return res.status(404).json({
        status: 'error',
        message: 'Backup file not found'
      });
    }
    
    const filename = path.basename(backup.results.location);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    const fileStream = fs.createReadStream(backup.results.location);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error downloading backup',
      error: error.message
    });
  }
};

/**
 * Execute backup process
 */
async function executeBackup(backupId, userId) {
  try {
    const backup = await Backup.findById(backupId);
    if (!backup) return;
    
    await backup.start(userId);
    
    // Get MongoDB connection details
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/vinsta';
    const dbName = mongoUri.split('/').pop().split('?')[0];
    
    // Create backup filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${dbName}_${timestamp}.gz`;
    const backupPath = path.join(backup.storage.config.path || './backups', filename);
    
    // Ensure backup directory exists
    const backupDir = path.dirname(backupPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Build mongodump command
    let command = `mongodump --uri="${mongoUri}" --gzip --archive="${backupPath}"`;
    
    // Add collection filters if specified
    if (backup.config.includeCollections.length > 0 && !backup.config.includeCollections.includes('*')) {
      const collections = backup.config.includeCollections.join(' ');
      command += ` --collection ${collections}`;
    }
    
    // Execute backup
    return new Promise((resolve, reject) => {
      const process = spawn(command, { shell: true });
      
      process.on('close', async (code) => {
        if (code === 0) {
          // Success
          const stats = fs.statSync(backupPath);
          const results = {
            fileSize: stats.size,
            fileCount: 1,
            location: backupPath,
            checksum: await calculateChecksum(backupPath)
          };
          
          await backup.complete(results);
          resolve();
        } else {
          // Failure
          await backup.fail('Backup process failed', { exitCode: code });
          reject(new Error(`Backup process failed with exit code ${code}`));
        }
      });
      
      process.on('error', async (error) => {
        await backup.fail('Backup process error', { error: error.message });
        reject(error);
      });
    });
  } catch (error) {
    const backup = await Backup.findById(backupId);
    if (backup) {
      await backup.fail('Backup execution failed', { error: error.message });
    }
  }
}

/**
 * Calculate file checksum
 */
async function calculateChecksum(filePath) {
  try {
    const crypto = require('crypto');
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  } catch (error) {
    return null;
  }
}

/**
 * Clean up old backups (cron job)
 */
export const cleanupOldBackups = async () => {
  try {
    const oldBackups = await Backup.getBackupsByRetention();
    
    for (const backup of oldBackups) {
      if (backup.results.location && fs.existsSync(backup.results.location)) {
        fs.unlinkSync(backup.results.location);
      }
      await Backup.findByIdAndDelete(backup._id);
    }  } catch (error) {  }
};

/**
 * Run scheduled backups (cron job)
 */
export const runScheduledBackups = async () => {
  try {
    const scheduledBackups = await Backup.getScheduledBackups();
    const now = new Date();
    
    for (const backup of scheduledBackups) {
      if (backup.schedule.nextRun && backup.schedule.nextRun <= now) {
        await executeBackup(backup._id, backup.execution.triggeredBy);
      }
    }  } catch (error) {  }
};
