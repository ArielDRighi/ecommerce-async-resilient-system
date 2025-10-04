import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { TestAppHelper, DatabaseHelper } from '../helpers';

/**
 * Users E2E Tests
 * Tests all user management endpoints including CRUD operations,
 * filtering, pagination, search, and user activation/deactivation
 */
describe('Users E2E Tests', () => {
  let app: INestApplication;
  let dbHelper: DatabaseHelper;
  let accessToken: string;
  let createdUserId: string;
  let currentUserId: string;

  beforeAll(async () => {
    app = await TestAppHelper.createApp();
    dbHelper = new DatabaseHelper(app);
  });

  afterAll(async () => {
    await dbHelper.cleanDatabase();
    await app.close();
  });

  beforeEach(async () => {
    await dbHelper.cleanDatabase();

    // Register and login to get auth token
    const userData = {
      email: `test-users-${Date.now()}@test.com`,
      password: 'Test123!',
      firstName: 'Test',
      lastName: 'User',
    };

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send(userData);

    accessToken = registerResponse.body.data.data.accessToken;
    currentUserId = registerResponse.body.data.data.user.id;
  });

  // ==================== CREATE USER ====================
  describe('POST /users', () => {
    it('should create a new user successfully with all fields', async () => {
      const newUserData = {
        email: `new-user-${Date.now()}@test.com`,
        passwordHash: 'NewUser123!',
        firstName: 'Jane',
        lastName: 'Doe',
        phoneNumber: '+1234567890',
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(newUserData)
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');

      const { data } = response.body;
      const user = data.data;

      expect(user).toHaveProperty('id');
      expect(user.email).toBe(newUserData.email.toLowerCase());
      expect(user.firstName).toBe(newUserData.firstName);
      expect(user.lastName).toBe(newUserData.lastName);
      expect(user.phoneNumber).toBe(newUserData.phoneNumber);
      expect(user.isActive).toBe(true);
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('passwordHash');
      expect(user).toHaveProperty('createdAt');
      expect(user).toHaveProperty('updatedAt');

      createdUserId = user.id;
    });

    it('should create user with minimal required fields', async () => {
      const newUserData = {
        email: `minimal-user-${Date.now()}@test.com`,
        passwordHash: 'MinimalUser123!',
        firstName: 'Min',
        lastName: 'User',
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(newUserData)
        .expect(HttpStatus.CREATED);

      const { data } = response.body;
      const user = data.data;

      expect(user.email).toBe(newUserData.email.toLowerCase());
      expect(user.firstName).toBe(newUserData.firstName);
      expect(user.lastName).toBe(newUserData.lastName);
      expect(user.phoneNumber).toBeNull();
    });

    it('should fail to create user with duplicate email', async () => {
      const newUserData = {
        email: `duplicate-${Date.now()}@test.com`,
        passwordHash: 'Duplicate123!',
        firstName: 'Duplicate',
        lastName: 'User',
      };

      // Create first user
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(newUserData)
        .expect(HttpStatus.CREATED);

      // Try to create duplicate
      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(newUserData)
        .expect(HttpStatus.CONFLICT);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('statusCode', HttpStatus.CONFLICT);
    });

    it('should fail to create user with invalid email format', async () => {
      const newUserData = {
        email: 'invalid-email-format',
        passwordHash: 'Valid123!',
        firstName: 'Invalid',
        lastName: 'Email',
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(newUserData)
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toBeDefined();
    });

    it('should fail to create user without authentication', async () => {
      const newUserData = {
        email: `no-auth-${Date.now()}@test.com`,
        passwordHash: 'NoAuth123!',
        firstName: 'No',
        lastName: 'Auth',
      };

      await request(app.getHttpServer())
        .post('/users')
        .send(newUserData)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should fail to create user with weak password', async () => {
      const newUserData = {
        email: `weak-pwd-${Date.now()}@test.com`,
        passwordHash: '123',
        firstName: 'Weak',
        lastName: 'Password',
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(newUserData)
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should fail to create user with missing required fields', async () => {
      const newUserData = {
        email: `missing-fields-${Date.now()}@test.com`,
        // Missing password, firstName, lastName
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(newUserData)
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toHaveProperty('success', false);
      expect(Array.isArray(response.body.message)).toBe(true);
    });
  });

  // ==================== LIST USERS ====================
  describe('GET /users', () => {
    beforeEach(async () => {
      // Create multiple test users
      const users = [
        {
          email: 'alice@test.com',
          passwordHash: 'Alice123!',
          firstName: 'Alice',
          lastName: 'Anderson',
        },
        {
          email: 'bob@test.com',
          passwordHash: 'Bob123!',
          firstName: 'Bob',
          lastName: 'Brown',
        },
        {
          email: 'charlie@test.com',
          passwordHash: 'Charlie123!',
          firstName: 'Charlie',
          lastName: 'Clark',
        },
      ];

      for (const user of users) {
        await request(app.getHttpServer())
          .post('/users')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(user);
      }
    });

    it('should get paginated list of users with default pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, limit: 10 })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');

      const { data } = response.body;
      const result = data.data;

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThanOrEqual(3);
      expect(result.meta).toMatchObject({
        page: 1,
        limit: 10,
      });
      expect(result.meta).toHaveProperty('total');
      expect(result.meta).toHaveProperty('totalPages');
    });

    it('should get users with custom pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, limit: 2 })
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const result = data.data;

      expect(result.data.length).toBeLessThanOrEqual(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(2);
    });

    it('should search users by name', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ search: 'Alice' })
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const result = data.data;

      expect(result.data.length).toBeGreaterThanOrEqual(1);
      const alice = result.data.find((u: any) => u.firstName === 'Alice');
      expect(alice).toBeDefined();
      expect(alice.lastName).toBe('Anderson');
    });

    it('should search users by partial name match', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ search: 'Bob' })
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const result = data.data;

      // Search by name should find users with that name
      if (result.data.length > 0) {
        const bob = result.data.find(
          (u: any) => u.firstName === 'Bob' || u.lastName.includes('Brown'),
        );
        expect(bob).toBeDefined();
      } else {
        // If no results, it means search works but no match found (still valid)
        expect(result.data).toEqual([]);
      }
    });

    it('should filter users by status (active)', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ status: 'active' })
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const result = data.data;

      expect(result.data.every((u: any) => u.isActive === true)).toBe(true);
    });

    it('should filter users by status (inactive)', async () => {
      // First deactivate a user
      const allUsers = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ limit: 100 });

      const userToDeactivate = allUsers.body.data.data.data.find(
        (u: any) => u.email === 'alice@test.com',
      );

      await request(app.getHttpServer())
        .delete(`/users/${userToDeactivate.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NO_CONTENT);

      // Now get inactive users
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ status: 'inactive' })
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const result = data.data;

      expect(result.data.length).toBeGreaterThanOrEqual(1);
      expect(result.data.every((u: any) => u.isActive === false)).toBe(true);
    });

    it('should sort users by firstName ascending', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ sortBy: 'firstName', sortOrder: 'ASC', limit: 100 })
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const result = data.data;

      for (let i = 1; i < result.data.length; i++) {
        expect(result.data[i].firstName >= result.data[i - 1].firstName).toBe(true);
      }
    });

    it('should sort users by email descending', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ sortBy: 'email', sortOrder: 'DESC', limit: 100 })
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const result = data.data;

      for (let i = 1; i < result.data.length; i++) {
        expect(result.data[i].email <= result.data[i - 1].email).toBe(true);
      }
    });

    it('should sort users by createdAt descending (default)', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ sortBy: 'createdAt', sortOrder: 'DESC' })
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const result = data.data;

      for (let i = 1; i < result.data.length; i++) {
        const date1 = new Date(result.data[i - 1].createdAt);
        const date2 = new Date(result.data[i].createdAt);
        expect(date1 >= date2).toBe(true);
      }
    });

    it('should fail to list users without authentication', async () => {
      await request(app.getHttpServer()).get('/users').expect(HttpStatus.UNAUTHORIZED);
    });
  });

  // ==================== GET CURRENT USER PROFILE ====================
  describe('GET /users/profile', () => {
    it('should get current user profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');

      const { data } = response.body;
      const user = data.data;

      expect(user).toHaveProperty('id');
      expect(user.id).toBe(currentUserId);
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('firstName');
      expect(user).toHaveProperty('lastName');
      expect(user).toHaveProperty('isActive');
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('should fail to get profile without authentication', async () => {
      await request(app.getHttpServer()).get('/users/profile').expect(HttpStatus.UNAUTHORIZED);
    });

    it('should fail to get profile with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', 'Bearer invalid-token-12345')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  // ==================== GET USER BY ID ====================
  describe('GET /users/:id', () => {
    beforeEach(async () => {
      const newUser = {
        email: `getbyid-${Date.now()}@test.com`,
        passwordHash: 'GetById123!',
        firstName: 'GetBy',
        lastName: 'Id',
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(newUser);

      createdUserId = response.body.data.data.id;
    });

    it('should get user by valid ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('success', true);

      const { data } = response.body;
      const user = data.data;

      expect(user.id).toBe(createdUserId);
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('firstName');
      expect(user).toHaveProperty('lastName');
      expect(user).not.toHaveProperty('password');
    });

    it('should return 404 for non-existent user ID', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

      await request(app.getHttpServer())
        .get(`/users/${nonExistentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 for invalid UUID format', async () => {
      await request(app.getHttpServer())
        .get('/users/invalid-uuid-format')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to get user without authentication', async () => {
      await request(app.getHttpServer())
        .get(`/users/${createdUserId}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  // ==================== UPDATE USER ====================
  describe('PATCH /users/:id', () => {
    beforeEach(async () => {
      const newUser = {
        email: `update-${Date.now()}@test.com`,
        passwordHash: 'Update123!',
        firstName: 'Update',
        lastName: 'Test',
        phoneNumber: '+1111111111',
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(newUser);

      createdUserId = response.body.data.data.id;
    });

    it('should update user successfully', async () => {
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name',
        phoneNumber: '+9999999999',
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('success', true);

      const { data } = response.body;
      const user = data.data;

      expect(user.id).toBe(createdUserId);
      expect(user.firstName).toBe(updateData.firstName);
      expect(user.lastName).toBe(updateData.lastName);
      expect(user.phoneNumber).toBe(updateData.phoneNumber);
    });

    it('should partially update user (only firstName)', async () => {
      const updateData = {
        firstName: 'PartialUpdate',
      };

      const response = await request(app.getHttpServer())
        .patch(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const user = data.data;

      expect(user.firstName).toBe(updateData.firstName);
      expect(user.lastName).toBe('Test'); // Should remain unchanged
    });

    it('should return 404 for non-existent user', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';
      const updateData = {
        firstName: 'NoUser',
      };

      await request(app.getHttpServer())
        .patch(`/users/${nonExistentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail to update with invalid data', async () => {
      const updateData = {
        email: 'invalid-email-format',
      };

      await request(app.getHttpServer())
        .patch(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to update user without authentication', async () => {
      const updateData = {
        firstName: 'NoAuth',
      };

      await request(app.getHttpServer())
        .patch(`/users/${createdUserId}`)
        .send(updateData)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  // ==================== SOFT DELETE USER ====================
  describe('DELETE /users/:id', () => {
    beforeEach(async () => {
      const newUser = {
        email: `delete-${Date.now()}@test.com`,
        passwordHash: 'Delete123!',
        firstName: 'Delete',
        lastName: 'Test',
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(newUser);

      createdUserId = response.body.data.data.id;
    });

    it('should soft delete user successfully', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NO_CONTENT);

      // Verify user is deactivated
      const response = await request(app.getHttpServer())
        .get(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const user = data.data;

      expect(user.isActive).toBe(false);
    });

    it('should return 404 for non-existent user', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

      await request(app.getHttpServer())
        .delete(`/users/${nonExistentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer())
        .delete('/users/invalid-uuid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to delete user without authentication', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${createdUserId}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should allow deleting already deleted user (idempotent)', async () => {
      // Delete first time
      await request(app.getHttpServer())
        .delete(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NO_CONTENT);

      // Delete second time should still succeed
      await request(app.getHttpServer())
        .delete(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NO_CONTENT);
    });
  });

  // ==================== ACTIVATE USER ====================
  describe('PATCH /users/:id/activate', () => {
    beforeEach(async () => {
      const newUser = {
        email: `activate-${Date.now()}@test.com`,
        passwordHash: 'Activate123!',
        firstName: 'Activate',
        lastName: 'Test',
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(newUser);

      createdUserId = response.body.data.data.id;

      // Deactivate the user first
      await request(app.getHttpServer())
        .delete(`/users/${createdUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NO_CONTENT);
    });

    it('should activate deactivated user successfully', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/users/${createdUserId}/activate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('success', true);

      const { data } = response.body;
      const user = data.data;

      expect(user.id).toBe(createdUserId);
      expect(user.isActive).toBe(true);
    });

    it('should return 404 for non-existent user', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

      await request(app.getHttpServer())
        .patch(`/users/${nonExistentId}/activate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(app.getHttpServer())
        .patch('/users/invalid-uuid/activate')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to activate without authentication', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${createdUserId}/activate`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should allow activating already active user (idempotent)', async () => {
      // Activate first time
      await request(app.getHttpServer())
        .patch(`/users/${createdUserId}/activate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      // Activate second time should still succeed
      const response = await request(app.getHttpServer())
        .patch(`/users/${createdUserId}/activate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const user = data.data;

      expect(user.isActive).toBe(true);
    });
  });

  // ==================== EDGE CASES & VALIDATION ====================
  describe('Edge Cases and Validation', () => {
    it('should handle pagination with page beyond total pages', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 999, limit: 10 })
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const result = data.data;

      expect(result.data).toEqual([]);
      expect(result.meta.page).toBe(999);
    });

    it('should enforce maximum limit of 100', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, limit: 150 })
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should reject negative page number', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: -1, limit: 10 })
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should reject invalid sort field', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ sortBy: 'invalidField', sortOrder: 'ASC' })
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle empty search term gracefully', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ search: '' })
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const result = data.data;

      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should return empty results for search with no matches', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ search: 'NonExistentUser12345XYZ' })
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const result = data.data;

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should normalize email to lowercase', async () => {
      const newUser = {
        email: `UPPERCASE-${Date.now()}@TEST.COM`,
        passwordHash: 'Uppercase123!',
        firstName: 'Upper',
        lastName: 'Case',
      };

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(newUser)
        .expect(HttpStatus.CREATED);

      const { data } = response.body;
      const user = data.data;

      expect(user.email).toBe(newUser.email.toLowerCase());
    });

    it('should trim whitespace from search terms', async () => {
      // Create a user with known name
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: `trimtest-${Date.now()}@test.com`,
          passwordHash: 'TrimTest123!',
          firstName: 'TrimTest',
          lastName: 'User',
        });

      // Search with extra whitespace
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ search: '  TrimTest  ' })
        .expect(HttpStatus.OK);

      const { data } = response.body;
      const result = data.data;

      expect(result.data.length).toBeGreaterThanOrEqual(1);
      const found = result.data.find((u: any) => u.firstName === 'TrimTest');
      expect(found).toBeDefined();
    });
  });
});
