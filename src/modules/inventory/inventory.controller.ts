import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import {
  CheckStockDto,
  ReserveStockDto,
  ReleaseReservationDto,
  FulfillReservationDto,
  StockMovementDto,
  InventoryResponseDto,
  InventoryStockDto,
  ReservationResponseDto,
  InventoryQueryDto,
  PaginatedResponseDto,
} from './dto';

@ApiTags('Inventory')
@Controller('inventory')
@ApiBearerAuth()
// @UseGuards(JwtAuthGuard) // TODO: Uncomment when auth is implemented
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  constructor(private readonly inventoryService: InventoryService) {}

  @Post('check-availability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check stock availability',
    description: 'Check if sufficient stock is available for a product at a specific location',
  })
  @ApiResponse({
    status: 200,
    description: 'Stock availability information',
    type: InventoryStockDto,
  })
  @ApiResponse({ status: 404, description: 'Inventory not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiBody({ type: CheckStockDto })
  async checkAvailability(
    @Body(ValidationPipe) checkStockDto: CheckStockDto,
  ): Promise<InventoryStockDto> {
    this.logger.log(`Checking availability for product ${checkStockDto.productId}`);
    return await this.inventoryService.checkAvailability(checkStockDto);
  }

  @Post('reserve')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Reserve stock',
    description: 'Reserve stock for a specific time period with TTL auto-release',
  })
  @ApiResponse({
    status: 201,
    description: 'Stock reserved successfully',
    type: ReservationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Inventory not found' })
  @ApiResponse({ status: 400, description: 'Insufficient stock' })
  @ApiResponse({ status: 409, description: 'Conflict during reservation' })
  @ApiBody({ type: ReserveStockDto })
  async reserveStock(
    @Body(ValidationPipe) reserveStockDto: ReserveStockDto,
  ): Promise<ReservationResponseDto> {
    this.logger.log(`Reserving stock: ${JSON.stringify(reserveStockDto)}`);
    return await this.inventoryService.reserveStock(reserveStockDto);
  }

  @Put('release-reservation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Release stock reservation',
    description: 'Release a previously made stock reservation back to available inventory',
  })
  @ApiResponse({
    status: 200,
    description: 'Reservation released successfully',
    type: InventoryStockDto,
  })
  @ApiResponse({ status: 404, description: 'Inventory not found' })
  @ApiResponse({ status: 400, description: 'Invalid release request' })
  @ApiBody({ type: ReleaseReservationDto })
  async releaseReservation(
    @Body(ValidationPipe) releaseDto: ReleaseReservationDto,
  ): Promise<InventoryStockDto> {
    this.logger.log(`Releasing reservation: ${releaseDto.reservationId}`);
    return await this.inventoryService.releaseReservation(releaseDto);
  }

  @Put('fulfill-reservation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Fulfill stock reservation',
    description: 'Convert a stock reservation to actual usage/sale',
  })
  @ApiResponse({
    status: 200,
    description: 'Reservation fulfilled successfully',
    type: InventoryStockDto,
  })
  @ApiResponse({ status: 404, description: 'Inventory not found' })
  @ApiResponse({ status: 400, description: 'Invalid fulfillment request' })
  @ApiBody({ type: FulfillReservationDto })
  async fulfillReservation(
    @Body(ValidationPipe) fulfillDto: FulfillReservationDto,
  ): Promise<InventoryStockDto> {
    this.logger.log(
      `Fulfilling reservation: ${fulfillDto.reservationId} for order ${fulfillDto.orderId}`,
    );
    return await this.inventoryService.fulfillReservation(fulfillDto);
  }

  @Post('add-stock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add stock',
    description: 'Add stock to inventory (restock, purchase, adjustment, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Stock added successfully',
    type: InventoryStockDto,
  })
  @ApiResponse({ status: 404, description: 'Inventory not found' })
  @ApiResponse({ status: 400, description: 'Invalid stock addition request' })
  @ApiBody({ type: StockMovementDto })
  async addStock(@Body(ValidationPipe) movementDto: StockMovementDto): Promise<InventoryStockDto> {
    this.logger.log(`Adding stock: ${JSON.stringify(movementDto)}`);
    return await this.inventoryService.addStock(movementDto);
  }

  @Post('remove-stock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove stock',
    description: 'Remove stock from inventory (sale, damage, theft, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Stock removed successfully',
    type: InventoryStockDto,
  })
  @ApiResponse({ status: 404, description: 'Inventory not found' })
  @ApiResponse({ status: 400, description: 'Invalid stock removal request' })
  @ApiBody({ type: StockMovementDto })
  async removeStock(
    @Body(ValidationPipe) movementDto: StockMovementDto,
  ): Promise<InventoryStockDto> {
    this.logger.log(`Removing stock: ${JSON.stringify(movementDto)}`);
    return await this.inventoryService.removeStock(movementDto);
  }

  @Get('product/:productId')
  @ApiOperation({
    summary: 'Get inventory by product ID',
    description: 'Retrieve inventory details for a specific product',
  })
  @ApiParam({
    name: 'productId',
    description: 'Product UUID',
    type: 'string',
  })
  @ApiQuery({
    name: 'location',
    description: 'Warehouse/location identifier',
    required: false,
    type: 'string',
    example: 'MAIN_WAREHOUSE',
  })
  @ApiResponse({
    status: 200,
    description: 'Inventory details',
    type: InventoryResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Inventory not found' })
  async getInventoryByProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('location') location?: string,
  ): Promise<InventoryResponseDto> {
    this.logger.log(`Getting inventory for product ${productId} at location ${location}`);
    return await this.inventoryService.getInventoryByProduct(productId, location);
  }

  @Get()
  @ApiOperation({
    summary: 'Get inventory list',
    description: 'Retrieve paginated list of inventory items with optional filtering',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-based)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
    example: 20,
  })
  @ApiQuery({
    name: 'productId',
    required: false,
    type: String,
    description: 'Filter by product ID',
  })
  @ApiQuery({
    name: 'location',
    required: false,
    type: String,
    description: 'Filter by location',
    example: 'MAIN_WAREHOUSE',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'],
    description: 'Filter by stock status',
  })
  @ApiQuery({
    name: 'minStock',
    required: false,
    type: Number,
    description: 'Minimum available stock filter',
  })
  @ApiQuery({
    name: 'maxStock',
    required: false,
    type: Number,
    description: 'Maximum available stock filter',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by product name or SKU',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated inventory list',
    type: PaginatedResponseDto<InventoryResponseDto>,
  })
  async getInventoryList(
    @Query(ValidationPipe) queryDto: InventoryQueryDto,
  ): Promise<PaginatedResponseDto<InventoryResponseDto>> {
    this.logger.log(`Getting inventory list with filters: ${JSON.stringify(queryDto)}`);
    return await this.inventoryService.getInventoryList(queryDto);
  }

  @Get('low-stock')
  @ApiOperation({
    summary: 'Get low stock items',
    description: 'Retrieve items that are below their reorder point or minimum stock levels',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-based)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
    example: 20,
  })
  @ApiQuery({ name: 'location', required: false, type: String, description: 'Filter by location' })
  @ApiResponse({
    status: 200,
    description: 'Paginated low stock items',
    type: PaginatedResponseDto<InventoryResponseDto>,
  })
  async getLowStockItems(
    @Query(ValidationPipe) queryParams: InventoryQueryDto,
  ): Promise<PaginatedResponseDto<InventoryResponseDto>> {
    const queryDto: InventoryQueryDto = {
      ...queryParams,
      status: 'LOW_STOCK',
    };

    this.logger.log(`Getting low stock items with filters: ${JSON.stringify(queryDto)}`);
    return await this.inventoryService.getInventoryList(queryDto);
  }

  @Get('out-of-stock')
  @ApiOperation({
    summary: 'Get out of stock items',
    description: 'Retrieve items that have zero available stock',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-based)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
    example: 20,
  })
  @ApiQuery({ name: 'location', required: false, type: String, description: 'Filter by location' })
  @ApiResponse({
    status: 200,
    description: 'Paginated out of stock items',
    type: PaginatedResponseDto<InventoryResponseDto>,
  })
  async getOutOfStockItems(
    @Query(ValidationPipe) queryParams: InventoryQueryDto,
  ): Promise<PaginatedResponseDto<InventoryResponseDto>> {
    const queryDto: InventoryQueryDto = {
      ...queryParams,
      status: 'OUT_OF_STOCK',
    };

    this.logger.log(`Getting out of stock items with filters: ${JSON.stringify(queryDto)}`);
    return await this.inventoryService.getInventoryList(queryDto);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get inventory statistics',
    description: 'Get overview statistics about inventory levels and status distribution',
  })
  @ApiQuery({ name: 'location', required: false, type: String, description: 'Filter by location' })
  @ApiResponse({
    status: 200,
    description: 'Inventory statistics',
    schema: {
      type: 'object',
      properties: {
        totalItems: { type: 'number', description: 'Total inventory items' },
        totalValue: { type: 'number', description: 'Total inventory value' },
        lowStockCount: { type: 'number', description: 'Items below reorder point' },
        outOfStockCount: { type: 'number', description: 'Items with zero stock' },
        statusBreakdown: {
          type: 'object',
          properties: {
            IN_STOCK: { type: 'number' },
            LOW_STOCK: { type: 'number' },
            OUT_OF_STOCK: { type: 'number' },
          },
        },
      },
    },
  })
  async getInventoryStats(@Query('location') location?: string): Promise<{
    totalItems: number;
    totalValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    statusBreakdown: {
      IN_STOCK: number;
      LOW_STOCK: number;
      OUT_OF_STOCK: number;
    };
  }> {
    this.logger.log(`Getting inventory stats for location: ${location}`);
    return await this.inventoryService.getInventoryStats(location);
  }
}
