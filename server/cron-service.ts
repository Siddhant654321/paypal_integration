import cron from 'node-cron';
import { EmailService } from './email-service';

export class CronService {
  private static emailDigestJob: cron.ScheduledTask;

  static initialize() {
    // Schedule daily digest emails to be sent at 9:00 AM every day
    this.emailDigestJob = cron.schedule('0 9 * * *', async () => {
      console.log('[CRON] Starting daily email digest job');
      try {
        await EmailService.sendDailyDigest();
        console.log('[CRON] Daily email digest job completed successfully');
      } catch (error) {
        console.error('[CRON] Error in daily email digest job:', error);
      }
    });

    console.log('[CRON] Email digest job scheduled');
  }

  static stop() {
    if (this.emailDigestJob) {
      this.emailDigestJob.stop();
      console.log('[CRON] Email digest job stopped');
    }
  }
}
