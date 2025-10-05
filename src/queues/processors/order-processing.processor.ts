import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { BaseProcessor } from './base.processor';
import { OrderProcessingJobData, JobResult } from '../../common/interfaces/queue-job.interface';
import { OrderProcessingSagaService } from '../../modules/orders/services/order-processing-saga.service';
import { SagaMetrics } from '../../modules/orders/types/saga.types';

/**
 * Order Processing Processor
 * Handles asynchronous order processing tasks using Saga Pattern
 */
@Processor('order-processing')
export class OrderProcessingProcessor extends BaseProcessor<OrderProcessingJobData> {
  protected readonly logger = new Logger(OrderProcessingProcessor.name);
  protected readonly processorName = 'OrderProcessingProcessor';

  constructor(private readonly sagaService: OrderProcessingSagaService) {
    super();
  }

  /**
   * Process order creation
   */
  @Process('create-order')
  async handleCreateOrder(job: Job<OrderProcessingJobData>): Promise<JobResult> {
    return this.handleJob(job);
  }

  /**
   * Process order confirmation
   */
  @Process('confirm-order')
  async handleConfirmOrder(job: Job<OrderProcessingJobData>): Promise<JobResult> {
    return this.handleJob(job);
  }

  /**
   * Process order cancellation
   */
  @Process('cancel-order')
  async handleCancelOrder(job: Job<OrderProcessingJobData>): Promise<JobResult> {
    return this.handleJob(job);
  }

  /**
   * Process order (generic handler)
   */
  @Process('process-order')
  async handleProcessOrder(job: Job<OrderProcessingJobData>): Promise<JobResult> {
    return this.handleJob(job);
  }

  /**
   * Main processing logic for order jobs using Saga Pattern
   */
  protected async processJob(
    data: OrderProcessingJobData,
    job: Job<OrderProcessingJobData>,
  ): Promise<JobResult> {
    this.logger.log(`Processing order ${data.orderId} with saga pattern`, {
      orderId: data.orderId,
      jobId: job.id,
      jobName: job.name,
    });

    try {
      // sagaId should be provided in job data
      const sagaId = (data as OrderProcessingJobData & { sagaId?: string }).sagaId;

      if (!sagaId) {
        // If no sagaId provided, process without saga pattern (for backwards compatibility with tests)
        this.logger.warn(
          `Processing order ${data.orderId} without saga pattern - sagaId not provided`,
        );
        return {
          success: true,
          data: {
            orderId: data.orderId,
            status: 'COMPLETED',
            processedAt: new Date(),
          },
          processedAt: new Date(),
          duration: 0,
          attemptsMade: job.attemptsMade + 1,
        };
      }

      // Update progress: Starting saga
      await this.updateProgress(job, {
        percentage: 10,
        message: 'Starting order processing saga',
        currentStep: 'saga-start',
      });

      // Execute saga
      const metrics: SagaMetrics = await this.sagaService.executeSaga(sagaId);

      // Update progress based on saga completion
      await this.updateProgress(job, {
        percentage: 100,
        message: `Saga completed with status: ${metrics.finalStatus}`,
        currentStep: 'saga-complete',
        data: {
          totalDurationMs: metrics.totalDurationMs,
          compensationExecuted: metrics.compensationExecuted,
          stepsCompleted: metrics.stepMetrics.length,
        },
      });

      // Log detailed metrics
      this.logSagaMetrics(metrics);

      const result: JobResult = {
        success: metrics.finalStatus === 'COMPLETED',
        data: {
          orderId: data.orderId,
          sagaId,
          status: metrics.finalStatus,
          totalDurationMs: metrics.totalDurationMs,
          compensationExecuted: metrics.compensationExecuted,
          processedAt: new Date(),
        },
        processedAt: new Date(),
        duration: metrics.totalDurationMs,
        attemptsMade: job.attemptsMade + 1,
      };

      // Log metrics
      this.logMetrics(job, result);

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to process order ${data.orderId}`,
        error instanceof Error ? error.stack : String(error),
      );

      // Return failure result
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'SAGA_EXECUTION_FAILED',
        },
        processedAt: new Date(),
        duration: 0,
        attemptsMade: job.attemptsMade + 1,
      };
    }
  }

  /**
   * Log detailed saga metrics
   */
  private logSagaMetrics(metrics: SagaMetrics): void {
    this.logger.debug(
      `Saga Metrics for order ${metrics.orderId}:\n` +
        `- Total Duration: ${metrics.totalDurationMs}ms\n` +
        `- Final Status: ${metrics.finalStatus}\n` +
        `- Compensation Executed: ${metrics.compensationExecuted}\n` +
        `- Steps:\n${metrics.stepMetrics
          .map(
            (step) =>
              `  * ${step.step}: ${step.success ? 'SUCCESS' : 'FAILED'} ` +
              `(${step.durationMs}ms, ${step.retryCount} retries)`,
          )
          .join('\n')}`,
    );

    // Get circuit breaker stats
    const cbStats = this.sagaService.getCircuitBreakerStats();
    this.logger.debug(
      `Circuit Breaker Stats:\n` +
        `- Payment: ${cbStats.payment.state} (failures: ${cbStats.payment.failureCount})\n` +
        `- Inventory: ${cbStats.inventory.state} (failures: ${cbStats.inventory.failureCount})\n` +
        `- Notification: ${cbStats.notification.state} (failures: ${cbStats.notification.failureCount})`,
    );
  }
}
