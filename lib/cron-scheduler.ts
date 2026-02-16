/**
 * CronScheduler - Stub (original removed during cleanup)
 */

interface CronConfig {
  id: string;
  name: string;
  volume: string;
  intervalMs: number;
  enabled: boolean;
}

export class CronScheduler {
  private static instance: CronScheduler;

  static getInstance(): CronScheduler {
    if (!CronScheduler.instance) {
      CronScheduler.instance = new CronScheduler();
    }
    return CronScheduler.instance;
  }

  registerCron(_config: CronConfig): void {
    // Stub
  }

  unregisterCron(_id: string): void {
    // Stub
  }
}
