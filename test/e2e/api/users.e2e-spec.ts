import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import request from 'supertest';
import { generateTestEmail } from '../../helpers/mock-data';

/**
 * Users API E2E Tests
 * Category: API Tests
 * Purpose: Test user management endpoints
 */
describe('Users API (E2E)', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Register admin user
    const adminResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: generateTestEmail(),
      password: 'AdminPassword123!',
      firstName: 'Admin',
      lastName: 'User',
    });
    adminToken = adminResponse.body.data.accessToken;

    // Register regular user
    const userResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: generateTestEmail(),
      password: 'UserPassword123!',
      firstName: 'Test',
      lastName: 'User',
    });
    userToken = userResponse.body.data.accessToken;
    userId = userResponse.body.data.user.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /users/me', () => {
    it('should get current user profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id', userId);
      expect(response.body.data).toHaveProperty('email');
      expect(response.body.data).not.toHaveProperty('password');
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer()).get('/users/me').expect(401);
    });
  });

  describe('PUT /users/me', () => {
    it('should update current user profile', async () => {
      const updateDto = {
        firstName: 'Updated',
        lastName: 'Name',
      };

      const response = await request(app.getHttpServer())
        .put('/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.firstName).toBe('Updated');
      expect(response.body.data.lastName).toBe('Name');
    });
  });

  describe('GET /users', () => {
    it('should get all users (admin only)', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('meta');
      expect(Array.isArray(response.body.data.data)).toBe(true);
    });

    it('should fail without admin role', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('GET /users/:id', () => {
    it('should get user by ID (admin only)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.id).toBe(userId);
      expect(response.body.data).not.toHaveProperty('password');
    });

    it('should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .get('/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PUT /users/:id', () => {
    it('should update user by ID (admin only)', async () => {
      const updateDto = {
        firstName: 'Admin',
        lastName: 'Updated',
      };

      const response = await request(app.getHttpServer())
        .put(`/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.lastName).toBe('Updated');
    });

    it('should fail without admin role', async () => {
      await request(app.getHttpServer())
        .put(`/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ firstName: 'Hack' })
        .expect(403);
    });
  });

  describe('PATCH /users/:id/deactivate', () => {
    it('should deactivate user (admin only)', async () => {
      // Create a user to deactivate
      const newUserResponse = await request(app.getHttpServer()).post('/auth/register').send({
        email: generateTestEmail(),
        password: 'DeactivateMe123!',
        firstName: 'Deactivate',
        lastName: 'User',
      });

      const deactivateUserId = newUserResponse.body.data.user.id;

      const response = await request(app.getHttpServer())
        .patch(`/users/${deactivateUserId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.isActive).toBe(false);
    });
  });

  describe('PATCH /users/:id/activate', () => {
    it('should activate user (admin only)', async () => {
      // Create and deactivate a user
      const newUserResponse = await request(app.getHttpServer()).post('/auth/register').send({
        email: generateTestEmail(),
        password: 'ActivateMe123!',
        firstName: 'Activate',
        lastName: 'User',
      });

      const activateUserId = newUserResponse.body.data.user.id;

      await request(app.getHttpServer())
        .patch(`/users/${activateUserId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Reactivate
      const response = await request(app.getHttpServer())
        .patch(`/users/${activateUserId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.isActive).toBe(true);
    });
  });

  describe('DELETE /users/:id', () => {
    it('should soft delete user (admin only)', async () => {
      // Create a user to delete
      const newUserResponse = await request(app.getHttpServer()).post('/auth/register').send({
        email: generateTestEmail(),
        password: 'DeleteMe123!',
        firstName: 'Delete',
        lastName: 'User',
      });

      const deleteUserId = newUserResponse.body.data.user.id;

      const response = await request(app.getHttpServer())
        .delete(`/users/${deleteUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should fail to delete without admin role', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('PATCH /users/me/change-password', () => {
    it('should change user password', async () => {
      const changePasswordDto = {
        currentPassword: 'UserPassword123!',
        newPassword: 'NewPassword456!',
      };

      const response = await request(app.getHttpServer())
        .patch('/users/me/change-password')
        .set('Authorization', `Bearer ${userToken}`)
        .send(changePasswordDto)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should fail with incorrect current password', async () => {
      await request(app.getHttpServer())
        .patch('/users/me/change-password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewPassword456!',
        })
        .expect(401);
    });

    it('should fail with weak new password', async () => {
      await request(app.getHttpServer())
        .patch('/users/me/change-password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'NewPassword456!',
          newPassword: 'weak',
        })
        .expect(400);
    });
  });
});
