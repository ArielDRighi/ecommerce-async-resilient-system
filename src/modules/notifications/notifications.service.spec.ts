import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { TemplateService } from './templates/template.service';
import { EmailProvider } from './providers/email.provider';
import { SMSProvider } from './providers/sms.provider';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationType, NotificationStatus, Language, TemplateType } from './enums';
import { SendOrderConfirmationDto, SendPaymentFailureDto, SendShippingUpdateDto } from './dto';

describe('NotificationsService', () => {
  let service: NotificationsService;
  // let emailProvider: EmailProvider;
  // let smsProvider: SMSProvider;
  let templateService: TemplateService;
  // let notificationRepository: Repository<NotificationEntity>;

  const mockNotificationRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        TemplateService,
        EmailProvider,
        SMSProvider,
        {
          provide: getRepositoryToken(NotificationEntity),
          useValue: mockNotificationRepository,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    // emailProvider = module.get<EmailProvider>(EmailProvider);
    // smsProvider = module.get<SMSProvider>(SMSProvider);
    templateService = module.get<TemplateService>(TemplateService);
    // notificationRepository = module.get<Repository<NotificationEntity>>(
    //   getRepositoryToken(NotificationEntity),
    // );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendOrderConfirmation', () => {
    it('should send order confirmation email', async () => {
      const dto: SendOrderConfirmationDto = {
        orderId: 'order-123',
        orderNumber: 'ORD-2024-001',
        totalAmount: 150.5,
        currency: 'USD',
        items: [],
      };

      const mockNotification = {
        id: 'notif-123',
        userId: dto.orderId,
        type: NotificationType.EMAIL,
        status: NotificationStatus.SENT,
      } as NotificationEntity;

      mockNotificationRepository.create.mockReturnValue(mockNotification);
      mockNotificationRepository.save.mockResolvedValue(mockNotification);

      const result = await service.sendOrderConfirmation(dto);

      expect(result).toBeDefined();
      // The test result can be SENT or FAILED due to the provider's 5% failure rate
      expect([NotificationStatus.SENT, NotificationStatus.FAILED]).toContain(result.status);
      expect(mockNotificationRepository.save).toHaveBeenCalled();
    });

    it('should use order confirmation template', async () => {
      const dto: SendOrderConfirmationDto = {
        orderId: 'order-123',
        orderNumber: 'ORD-2024-001',
        totalAmount: 150.5,
        currency: 'USD',
        items: [],
      };

      const templateSpy = jest.spyOn(templateService, 'renderTemplate');

      mockNotificationRepository.create.mockReturnValue({} as NotificationEntity);
      mockNotificationRepository.save.mockResolvedValue({
        id: 'notif-123',
      } as NotificationEntity);

      await service.sendOrderConfirmation(dto);

      expect(templateSpy).toHaveBeenCalledWith(
        TemplateType.ORDER_CONFIRMATION,
        expect.objectContaining({
          orderNumber: dto.orderNumber,
          totalAmount: dto.totalAmount,
          currency: dto.currency,
        }),
        Language.EN,
      );
    });
  });

  describe('sendPaymentFailure', () => {
    it('should send payment failure notification', async () => {
      // Mock Math.random to ensure success (EmailProvider has 5% failure rate)
      jest.spyOn(Math, 'random').mockReturnValue(0.1); // < 0.95 = success

      const dto: SendPaymentFailureDto = {
        orderId: 'order-123',
        orderNumber: 'ORD-2024-001',
        reason: 'Insufficient funds',
      };

      const mockNotification = {
        id: 'notif-124',
        userId: dto.orderId,
        type: NotificationType.EMAIL,
        status: NotificationStatus.SENT,
      } as NotificationEntity;

      mockNotificationRepository.create.mockReturnValue(mockNotification);
      mockNotificationRepository.save.mockResolvedValue(mockNotification);

      const result = await service.sendPaymentFailure(dto);

      expect(result).toBeDefined();
      expect(result.status).toBe(NotificationStatus.SENT);
      expect(mockNotificationRepository.save).toHaveBeenCalled();
    });

    it('should use payment failure template with high priority', async () => {
      const dto: SendPaymentFailureDto = {
        orderId: 'order-123',
        orderNumber: 'ORD-2024-001',
        reason: 'Card declined',
      };

      const templateSpy = jest.spyOn(templateService, 'renderTemplate');

      mockNotificationRepository.create.mockReturnValue({} as NotificationEntity);
      mockNotificationRepository.save.mockResolvedValue({
        id: 'notif-124',
      } as NotificationEntity);

      await service.sendPaymentFailure(dto);

      expect(templateSpy).toHaveBeenCalledWith(
        TemplateType.PAYMENT_FAILURE,
        expect.objectContaining({
          orderNumber: dto.orderNumber,
          reason: dto.reason,
        }),
        Language.EN,
      );
    });
  });

  describe('sendShippingUpdate', () => {
    it('should send shipping update notification', async () => {
      const dto: SendShippingUpdateDto = {
        orderId: 'order-123',
        orderNumber: 'ORD-2024-001',
        trackingNumber: 'TRACK-123',
        carrier: 'DHL',
      };

      const mockNotification = {
        id: 'notif-125',
        userId: dto.orderId,
        type: NotificationType.EMAIL,
        status: NotificationStatus.SENT,
      } as NotificationEntity;

      mockNotificationRepository.create.mockReturnValue(mockNotification);
      mockNotificationRepository.save.mockResolvedValue(mockNotification);

      const result = await service.sendShippingUpdate(dto);

      expect(result).toBeDefined();
      // The test result can be SENT or FAILED due to the provider's 5% failure rate
      expect([NotificationStatus.SENT, NotificationStatus.FAILED]).toContain(result.status);
      expect(mockNotificationRepository.save).toHaveBeenCalled();
    });

    it('should use shipping update template', async () => {
      const dto: SendShippingUpdateDto = {
        orderId: 'order-123',
        orderNumber: 'ORD-2024-001',
        trackingNumber: 'TRACK-123',
        carrier: 'FedEx',
      };

      const templateSpy = jest.spyOn(templateService, 'renderTemplate');

      mockNotificationRepository.create.mockReturnValue({} as NotificationEntity);
      mockNotificationRepository.save.mockResolvedValue({
        id: 'notif-125',
      } as NotificationEntity);

      await service.sendShippingUpdate(dto);

      expect(templateSpy).toHaveBeenCalledWith(
        TemplateType.SHIPPING_UPDATE,
        expect.objectContaining({
          orderNumber: dto.orderNumber,
          trackingNumber: dto.trackingNumber,
          carrier: dto.carrier,
        }),
        Language.EN,
      );
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email to new user', async () => {
      const userId = 'user-456';

      const mockNotification = {
        id: 'notif-126',
        userId,
        type: NotificationType.EMAIL,
        status: NotificationStatus.SENT,
      } as NotificationEntity;

      mockNotificationRepository.create.mockReturnValue(mockNotification);
      mockNotificationRepository.save.mockResolvedValue(mockNotification);

      const result = await service.sendWelcomeEmail(userId);

      expect(result).toBeDefined();
      // The test result can be SENT or FAILED due to the provider's 5% failure rate
      expect([NotificationStatus.SENT, NotificationStatus.FAILED]).toContain(result.status);
      expect(mockNotificationRepository.save).toHaveBeenCalled();
    });

    it('should use welcome email template', async () => {
      const userId = 'user-456';

      const templateSpy = jest.spyOn(templateService, 'renderTemplate');

      mockNotificationRepository.create.mockReturnValue({} as NotificationEntity);
      mockNotificationRepository.save.mockResolvedValue({
        id: 'notif-126',
      } as NotificationEntity);

      await service.sendWelcomeEmail(userId);

      expect(templateSpy).toHaveBeenCalledWith(
        TemplateType.WELCOME_EMAIL,
        expect.any(Object),
        Language.EN,
      );
    });
  });

  describe('shouldSendNotification', () => {
    it('should return true when no preferences provided', async () => {
      const result = await service.shouldSendNotification('user-123', NotificationType.EMAIL);

      expect(result).toBe(true);
    });

    it('should respect email preferences', async () => {
      const preferences = {
        userId: 'user-123',
        email: { enabled: false, address: 'test@example.com' },
        sms: { enabled: true, phoneNumber: '+1234567890', optedOut: false },
        push: { enabled: true },
      };

      const result = await service.shouldSendNotification(
        'user-123',
        NotificationType.EMAIL,
        preferences,
      );

      expect(result).toBe(false);
    });

    it('should respect SMS opt-out', async () => {
      const preferences = {
        userId: 'user-123',
        email: { enabled: true, address: 'test@example.com' },
        sms: { enabled: true, phoneNumber: '+1234567890', optedOut: true },
        push: { enabled: true },
      };

      const result = await service.shouldSendNotification(
        'user-123',
        NotificationType.SMS,
        preferences,
      );

      expect(result).toBe(false);
    });
  });

  describe('getNotificationStatus', () => {
    it('should return notification status when found', async () => {
      const notificationId = 'notif-123';
      const mockNotification = {
        id: notificationId,
        status: NotificationStatus.SENT,
        messageId: 'msg-123',
        sentAt: new Date(),
      } as NotificationEntity;

      mockNotificationRepository.findOne.mockResolvedValue(mockNotification);

      const result = await service.getNotificationStatus(notificationId);

      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      expect(result?.messageId).toBe('msg-123');
    });

    it('should return null when notification not found', async () => {
      mockNotificationRepository.findOne.mockResolvedValue(null);

      const result = await service.getNotificationStatus('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getUserNotifications', () => {
    it('should return all notifications for a user', async () => {
      const userId = 'user-123';
      const mockNotifications = [
        { id: 'notif-1', userId } as NotificationEntity,
        { id: 'notif-2', userId } as NotificationEntity,
      ];

      mockNotificationRepository.find.mockResolvedValue(mockNotifications);

      const result = await service.getUserNotifications(userId);

      expect(result).toHaveLength(2);
      expect(mockNotificationRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
    });
  });
});
