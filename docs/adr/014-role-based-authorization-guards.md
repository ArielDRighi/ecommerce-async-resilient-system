# ADR-014: Role-Based Authorization Guards (Planned)

**Status:** Planned (Foundation exists in JWT payload)  
**Date:** 2024-01-17  
**Author:** Development Team  
**Related ADRs:** ADR-013 (JWT Authentication)

---

## Context

Después de implementar JWT authentication (ADR-013), necesitamos **autorización basada en roles** para controlar **quién puede hacer qué**:

### Current State (JWT Payload Includes Role)

```typescript
// JWT already includes role field
{
  "sub": "uuid-123",
  "email": "user@example.com",
  "role": "customer",  // ✅ Role already in token!
  "iat": 1705523600,
  "exp": 1705524500
}
```

### Problem Scenarios

**Scenario 1: Admin-Only Endpoints**

```typescript
@Delete('/users/:id')  // Delete user endpoint
async deleteUser(@Param('id') id: string) {
  return this.usersService.delete(id);
}

PROBLEM: ANY authenticated user can delete ANY user! 🚨
NEED: Only admins should be able to delete users
```

**Scenario 2: User Can Only Access Own Data**

```typescript
@Get('/orders/:id')
async getOrder(@Param('id') orderId: string) {
  return this.ordersService.findOne(orderId);
}

PROBLEM: User A can view User B's orders! 🚨
NEED: Users can only view their OWN orders (or admins can view all)
```

**Scenario 3: Role-Based Pricing/Features**

```typescript
// VIP customers get discounts
if (user.role === 'vip') {
  discount = 0.20;  // 20% discount
} else if (user.role === 'customer') {
  discount = 0.05;  // 5% discount
}

PROBLEM: Role check scattered across codebase
NEED: Centralized role-based access control
```

---

## Decision (Planned Implementation)

Implement **@Roles() Decorator + RolesGuard** for declarative role-based authorization:

```typescript
/**
 * Planned: Roles enum in User entity
 */
export enum UserRole {
  ADMIN = 'admin', // Full access
  CUSTOMER = 'customer', // Standard user
  GUEST = 'guest', // Limited access
  VIP = 'vip', // Premium customer
}

/**
 * Planned: @Roles() Decorator
 * Location: src/common/decorators/roles.decorator.ts
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Planned: RolesGuard
 * Location: src/common/guards/roles.guard.ts
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true; // No role requirement
    }

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.role === role);
  }
}
```

---

## Usage Examples (Planned)

### Example 1: Admin-Only Endpoint

```typescript
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard) // ✅ Apply both guards
@Roles(UserRole.ADMIN) // ✅ Require admin role
export class UserAdminController {
  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    return this.usersService.delete(id);
  }

  @Get()
  async listAllUsers() {
    return this.usersService.findAll();
  }
}
```

### Example 2: Multiple Roles Allowed

```typescript
@Get('reports')
@Roles(UserRole.ADMIN, UserRole.VIP)  // Admin OR VIP can access
async getReports() {
  return this.reportsService.generate();
}
```

### Example 3: Check Ownership in Route Handler

```typescript
@Get('orders/:id')
@UseGuards(JwtAuthGuard)  // Auth required, but no role restriction
async getOrder(
  @Param('id') orderId: string,
  @CurrentUser() user: CurrentUserPayload,
) {
  const order = await this.ordersService.findOne(orderId);

  // ✅ Check ownership OR admin
  if (order.userId !== user.sub && user.role !== UserRole.ADMIN) {
    throw new ForbiddenException('You can only view your own orders');
  }

  return order;
}
```

---

## Implementation Plan

**Phase 1: Database Schema (Priority: HIGH)**

```sql
-- Add role column to users table
ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'customer';
ALTER TABLE users ADD CONSTRAINT check_user_role
  CHECK (role IN ('admin', 'customer', 'guest', 'vip'));

-- Create index for role filtering
CREATE INDEX idx_users_role ON users(role);
```

**Phase 2: Update User Entity**

```typescript
// src/modules/users/entities/user.entity.ts
@Column({
  type: 'varchar',
  length: 20,
  nullable: false,
  default: UserRole.CUSTOMER,
})
role: UserRole;
```

**Phase 3: Create RolesGuard**

```typescript
// src/common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.role) {
      throw new ForbiddenException('User role not found');
    }

    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      throw new ForbiddenException(`Requires one of roles: ${requiredRoles.join(', ')}`);
    }

    return true;
  }
}
```

**Phase 4: Apply to Controllers**

```typescript
// Protect admin routes
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  /* ... */
}

// Customer-only routes
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER, UserRole.VIP, UserRole.ADMIN)
export class OrdersController {
  /* ... */
}
```

**Phase 5: Testing**

```typescript
describe('RolesGuard', () => {
  it('should allow admin to access admin-only endpoint', async () => {
    const token = await generateTestToken({ role: UserRole.ADMIN });

    await request(app.getHttpServer())
      .delete('/admin/users/123')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('should deny customer access to admin endpoint', async () => {
    const token = await generateTestToken({ role: UserRole.CUSTOMER });

    await request(app.getHttpServer())
      .delete('/admin/users/123')
      .set('Authorization', `Bearer ${token}`)
      .expect(403)
      .expect((res) => {
        expect(res.body.message).toContain('Requires one of roles: admin');
      });
  });
});
```

---

## Why Not Implemented Yet?

**Current Priority:** Core business logic (orders, payments, inventory) takes precedence

**Workaround:** Manual role checks in route handlers:

```typescript
if (user.role !== 'admin') {
  throw new ForbiddenException();
}
```

**When to Implement:**

- Before production launch (security requirement)
- When adding admin panel features
- When implementing VIP/tiered pricing

---

## Benefits (When Implemented)

✅ **Declarative Authorization:** Clear role requirements at controller/method level  
✅ **Centralized Logic:** No scattered `if (user.role === 'admin')` checks  
✅ **Type-Safe:** UserRole enum prevents typos  
✅ **Testable:** Easy to test guard in isolation  
✅ **Reusable:** Apply to any controller/route  
✅ **Composable:** Combine with JwtAuthGuard

---

## References

- [ADR-013: JWT Authentication Strategy](./013-jwt-authentication-strategy.md)
- [NestJS Guards Documentation](https://docs.nestjs.com/guards)
- [NestJS Authorization](https://docs.nestjs.com/security/authorization)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

---

## Code Locations (Planned)

```
src/common/guards/roles.guard.ts       - RolesGuard implementation
src/common/decorators/roles.decorator.ts - @Roles() decorator
src/modules/users/entities/user.entity.ts - Add role column
src/modules/users/enums/user-role.enum.ts - UserRole enum
```

---

**Status:** ⏳ **PLANNED (Foundation exists in JWT)**  
**Priority:** HIGH (implement before production)  
**Estimated Effort:** 2-4 hours  
**Last Updated:** 2024-01-17  
**Author:** Development Team
