import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { TestAppHelper, DatabaseHelper } from '../../helpers';

describe('Categories E2E Tests', () => {
  let app: INestApplication;
  let dbHelper: DatabaseHelper;
  let accessToken: string;
  let rootCategoryId: string;
  let subCategoryId: string;

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
      email: `test-categories-${Date.now()}@test.com`,
      password: 'Test123!',
      firstName: 'Test',
      lastName: 'User',
    };

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send(userData);

    accessToken = registerResponse.body.data.data.accessToken;
  });

  describe('POST /categories', () => {
    it('should create a root category successfully', async () => {
      const categoryData = {
        name: 'Electronics',
        description: 'Electronic products and gadgets',
        slug: 'electronics',
        sortOrder: 1,
        metadata: {
          color: '#FF5722',
          icon: 'electronics-icon',
        },
      };

      const response = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(categoryData)
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('data');

      const category = response.body.data.data;
      expect(category).toMatchObject({
        name: categoryData.name,
        description: categoryData.description,
        slug: categoryData.slug,
        sortOrder: categoryData.sortOrder,
        isActive: true,
      });
      expect(category).toHaveProperty('id');
      expect(category).toHaveProperty('createdAt');
      expect(category.parentId).toBeNull();
      expect(category.metadata).toEqual(categoryData.metadata);

      rootCategoryId = category.id;
    });

    it('should create a sub-category with parentId', async () => {
      // First create a root category
      const rootData = {
        name: 'Electronics',
        slug: 'electronics',
      };

      const rootResponse = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(rootData)
        .expect(HttpStatus.CREATED);

      const rootId = rootResponse.body.data.data.id;

      // Create sub-category
      const subData = {
        name: 'Smartphones',
        slug: 'smartphones',
        parentId: rootId,
        sortOrder: 10,
      };

      const response = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(subData)
        .expect(HttpStatus.CREATED);

      const subCategory = response.body.data.data;
      expect(subCategory).toMatchObject({
        name: subData.name,
        slug: subData.slug,
        parentId: rootId,
        sortOrder: subData.sortOrder,
        isActive: true,
      });
    });

    it('should auto-generate slug if not provided', async () => {
      const categoryData = {
        name: 'Home & Kitchen',
        description: 'Home and kitchen products',
      };

      const response = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(categoryData)
        .expect(HttpStatus.CREATED);

      const category = response.body.data.data;
      expect(category.slug).toBe('home-kitchen');
    });

    it('should fail to create category without authentication', async () => {
      const categoryData = {
        name: 'Test Category',
        slug: 'test-category',
      };

      await request(app.getHttpServer())
        .post('/categories')
        .send(categoryData)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should fail to create category without name', async () => {
      const categoryData = {
        slug: 'test-category',
      };

      const response = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(categoryData)
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toHaveProperty('message');
      expect(Array.isArray(response.body.message)).toBe(true);
    });

    it('should fail to create category with duplicate slug', async () => {
      const categoryData = {
        name: 'Electronics',
        slug: 'electronics',
      };

      // Create first category
      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(categoryData)
        .expect(HttpStatus.CREATED);

      // Try to create duplicate
      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(categoryData)
        .expect(HttpStatus.CONFLICT);
    });

    it('should fail to create category with non-existent parentId', async () => {
      const categoryData = {
        name: 'Test Category',
        slug: 'test-category',
        parentId: '550e8400-e29b-41d4-a716-446655440000', // Non-existent UUID
      };

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(categoryData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to create category with invalid slug format', async () => {
      const categoryData = {
        name: 'Test Category',
        slug: 'Invalid Slug With Spaces',
      };

      const response = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(categoryData)
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toHaveProperty('message');
      expect(Array.isArray(response.body.message)).toBe(true);
    });

    it('should fail to create category with name less than 2 characters', async () => {
      const categoryData = {
        name: 'A',
        slug: 'a',
      };

      const response = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(categoryData)
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body).toHaveProperty('message');
      expect(Array.isArray(response.body.message)).toBe(true);
    });
  });

  describe('GET /categories', () => {
    beforeEach(async () => {
      // Create test categories
      const categories = [
        { name: 'Electronics', slug: 'electronics', sortOrder: 1 },
        { name: 'Books', slug: 'books', sortOrder: 2 },
        { name: 'Clothing', slug: 'clothing', sortOrder: 3 },
      ];

      for (const cat of categories) {
        await request(app.getHttpServer())
          .post('/categories')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(cat);
      }
    });

    it('should get paginated list of categories', async () => {
      const response = await request(app.getHttpServer())
        .get('/categories')
        .query({ page: 1, limit: 10 })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('data');

      const result = response.body.data.data;
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(3);
      expect(result.meta).toMatchObject({
        page: 1,
        limit: 10,
        total: 3,
        totalPages: 1,
      });
    });

    it('should filter categories by isActive', async () => {
      // Deactivate one category
      const allCategories = await request(app.getHttpServer())
        .get('/categories')
        .query({ limit: 100 });

      const categoryId = allCategories.body.data.data.data[0].id;

      await request(app.getHttpServer())
        .patch(`/categories/${categoryId}/deactivate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      // Get only active categories
      const response = await request(app.getHttpServer())
        .get('/categories')
        .query({ isActive: true })
        .expect(HttpStatus.OK);

      const items = response.body.data.data.data;
      expect(items.length).toBe(2);
      expect(items.every((cat: any) => cat.isActive === true)).toBe(true);
    });

    it('should search categories by name', async () => {
      const response = await request(app.getHttpServer())
        .get('/categories')
        .query({ search: 'elect' })
        .expect(HttpStatus.OK);

      const items = response.body.data.data.data;
      expect(items.length).toBe(1);
      expect(items[0].name).toBe('Electronics');
    });

    it('should sort categories by sortOrder', async () => {
      const response = await request(app.getHttpServer())
        .get('/categories')
        .query({ sortBy: 'sortOrder', sortOrder: 'ASC' })
        .expect(HttpStatus.OK);

      const items = response.body.data.data.data;
      expect(items[0].sortOrder).toBe(1);
      expect(items[1].sortOrder).toBe(2);
      expect(items[2].sortOrder).toBe(3);
    });

    it('should handle pagination correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/categories')
        .query({ page: 1, limit: 2 })
        .expect(HttpStatus.OK);

      const result = response.body.data.data;
      expect(result.data.length).toBe(2);
      expect(result.meta).toMatchObject({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
    });
  });

  describe('GET /categories/tree', () => {
    beforeEach(async () => {
      // Create hierarchical categories
      const electronicsRes = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Electronics', slug: 'electronics' });
      const electronicsId = electronicsRes.body.data.data.id;

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Smartphones', slug: 'smartphones', parentId: electronicsId });

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Laptops', slug: 'laptops', parentId: electronicsId });

      const booksRes = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Books', slug: 'books' });
      const booksId = booksRes.body.data.data.id;

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Fiction', slug: 'fiction', parentId: booksId });
    });

    it('should get full category tree structure', async () => {
      const response = await request(app.getHttpServer())
        .get('/categories/tree')
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('data');

      const tree = response.body.data.data;
      expect(Array.isArray(tree)).toBe(true);
      expect(tree.length).toBe(2); // 2 root categories

      const electronics = tree.find((c: any) => c.slug === 'electronics');
      expect(electronics).toBeDefined();
      expect(electronics.children).toBeDefined();
      expect(electronics.children.length).toBe(2); // Smartphones and Laptops
    });

    it('should get tree with only active categories', async () => {
      // Deactivate a category
      const allCategories = await request(app.getHttpServer())
        .get('/categories')
        .query({ limit: 100 });
      const laptopCategory = allCategories.body.data.data.data.find(
        (c: any) => c.slug === 'laptops',
      );

      await request(app.getHttpServer())
        .patch(`/categories/${laptopCategory.id}/deactivate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      const response = await request(app.getHttpServer())
        .get('/categories/tree')
        .query({ activeOnly: true })
        .expect(HttpStatus.OK);

      const tree = response.body.data.data;
      const electronics = tree.find((c: any) => c.slug === 'electronics');

      // Laptops should not be in the tree
      expect(electronics.children.length).toBe(1);
      expect(electronics.children.find((c: any) => c.slug === 'laptops')).toBeUndefined();
    });

    it('should return empty array when no categories exist', async () => {
      await dbHelper.cleanDatabase();

      const response = await request(app.getHttpServer())
        .get('/categories/tree')
        .expect(HttpStatus.OK);

      const tree = response.body.data.data;
      expect(Array.isArray(tree)).toBe(true);
      expect(tree.length).toBe(0);
    });
  });

  describe('GET /categories/slug/:slug', () => {
    beforeEach(async () => {
      const categoryData = {
        name: 'Electronics',
        slug: 'electronics',
        description: 'Electronic products',
      };

      const response = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(categoryData);

      rootCategoryId = response.body.data.data.id;
    });

    it('should find category by slug successfully', async () => {
      const response = await request(app.getHttpServer())
        .get('/categories/slug/electronics')
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('data');

      const category = response.body.data.data;
      expect(category).toMatchObject({
        id: rootCategoryId,
        slug: 'electronics',
        name: 'Electronics',
        description: 'Electronic products',
      });
    });

    it('should return 404 when slug not found', async () => {
      await request(app.getHttpServer())
        .get('/categories/slug/non-existent-slug')
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should handle special characters in slug', async () => {
      const categoryData = {
        name: 'Test Category 123',
        slug: 'test-category-123',
      };

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(categoryData);

      const response = await request(app.getHttpServer())
        .get('/categories/slug/test-category-123')
        .expect(HttpStatus.OK);

      expect(response.body.data.data.slug).toBe('test-category-123');
    });
  });

  describe('GET /categories/:id', () => {
    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Test Category', slug: 'test-category' });

      rootCategoryId = response.body.data.data.id;
    });

    it('should get category by ID successfully', async () => {
      const response = await request(app.getHttpServer())
        .get(`/categories/${rootCategoryId}`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('data');

      const category = response.body.data.data;
      expect(category).toMatchObject({
        id: rootCategoryId,
        name: 'Test Category',
        slug: 'test-category',
      });
    });

    it('should return 404 when ID not found', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';
      await request(app.getHttpServer())
        .get(`/categories/${nonExistentId}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 400 for invalid UUID format', async () => {
      await request(app.getHttpServer())
        .get('/categories/invalid-uuid')
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /categories/:id/descendants', () => {
    beforeEach(async () => {
      // Create hierarchical structure: Electronics -> Smartphones -> Android
      const electronicsRes = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Electronics', slug: 'electronics' });
      rootCategoryId = electronicsRes.body.data.data.id;

      const smartphonesRes = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Smartphones', slug: 'smartphones', parentId: rootCategoryId });
      subCategoryId = smartphonesRes.body.data.data.id;

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Android', slug: 'android', parentId: subCategoryId });

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'iOS', slug: 'ios', parentId: subCategoryId });
    });

    it('should get all descendants of a category', async () => {
      const response = await request(app.getHttpServer())
        .get(`/categories/${rootCategoryId}/descendants`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('data');

      const descendants = response.body.data.data;
      expect(Array.isArray(descendants)).toBe(true);
      expect(descendants.length).toBe(3); // Smartphones, Android, iOS
    });

    it('should return empty array when category has no descendants', async () => {
      // Get descendants of Android (leaf node)
      const allCategories = await request(app.getHttpServer())
        .get('/categories')
        .query({ limit: 100 });
      const androidCategory = allCategories.body.data.data.data.find(
        (c: any) => c.slug === 'android',
      );

      const response = await request(app.getHttpServer())
        .get(`/categories/${androidCategory.id}/descendants`)
        .expect(HttpStatus.OK);

      const descendants = response.body.data.data;
      expect(Array.isArray(descendants)).toBe(true);
      expect(descendants.length).toBe(0);
    });

    it('should return 404 when parent category not found', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';
      await request(app.getHttpServer())
        .get(`/categories/${nonExistentId}/descendants`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /categories/:id/path', () => {
    beforeEach(async () => {
      // Create hierarchy: Electronics -> Smartphones -> Android
      const electronicsRes = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Electronics', slug: 'electronics' });
      rootCategoryId = electronicsRes.body.data.data.id;

      const smartphonesRes = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Smartphones', slug: 'smartphones', parentId: rootCategoryId });
      subCategoryId = smartphonesRes.body.data.data.id;
    });

    it('should get full path to a category', async () => {
      const response = await request(app.getHttpServer())
        .get(`/categories/${subCategoryId}/path`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('data');

      const path = response.body.data.data;
      expect(Array.isArray(path)).toBe(true);
      expect(path.length).toBe(2); // Electronics -> Smartphones
      expect(path[0]).toBe('Electronics');
      expect(path[1]).toBe('Smartphones');
    });

    it('should return single item for root category', async () => {
      const response = await request(app.getHttpServer())
        .get(`/categories/${rootCategoryId}/path`)
        .expect(HttpStatus.OK);

      const path = response.body.data.data;
      expect(Array.isArray(path)).toBe(true);
      expect(path.length).toBe(1);
      expect(path[0]).toBe('Electronics');
    });

    it('should return 404 when category not found', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';
      await request(app.getHttpServer())
        .get(`/categories/${nonExistentId}/path`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('PUT /categories/:id', () => {
    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Old Name', slug: 'old-name', description: 'Old description' });

      rootCategoryId = response.body.data.data.id;
    });

    it('should update category successfully', async () => {
      const updateData = {
        name: 'New Name',
        description: 'New description',
        sortOrder: 10,
      };

      const response = await request(app.getHttpServer())
        .put(`/categories/${rootCategoryId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('data');

      const category = response.body.data.data;
      expect(category).toMatchObject({
        id: rootCategoryId,
        name: updateData.name,
        description: updateData.description,
        sortOrder: updateData.sortOrder,
      });
    });

    it('should fail to update category without authentication', async () => {
      const updateData = { name: 'New Name' };

      await request(app.getHttpServer())
        .put(`/categories/${rootCategoryId}`)
        .send(updateData)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 404 when updating non-existent category', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';
      const updateData = { name: 'New Name' };

      await request(app.getHttpServer())
        .put(`/categories/${nonExistentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('PATCH /categories/:id/activate', () => {
    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Test Category', slug: 'test-category' });

      rootCategoryId = response.body.data.data.id;

      // Deactivate it first
      await request(app.getHttpServer())
        .patch(`/categories/${rootCategoryId}/deactivate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);
    });

    it('should activate category successfully', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/categories/${rootCategoryId}/activate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('data');

      const category = response.body.data.data;
      expect(category.isActive).toBe(true);
    });

    it('should fail to activate without authentication', async () => {
      await request(app.getHttpServer())
        .patch(`/categories/${rootCategoryId}/activate`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 404 when activating non-existent category', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

      await request(app.getHttpServer())
        .patch(`/categories/${nonExistentId}/activate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('PATCH /categories/:id/deactivate', () => {
    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Test Category', slug: 'test-category' });

      rootCategoryId = response.body.data.data.id;
    });

    it('should deactivate category successfully', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/categories/${rootCategoryId}/deactivate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('data');

      const category = response.body.data.data;
      expect(category.isActive).toBe(false);
    });

    it('should fail to deactivate without authentication', async () => {
      await request(app.getHttpServer())
        .patch(`/categories/${rootCategoryId}/deactivate`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 404 when deactivating non-existent category', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

      await request(app.getHttpServer())
        .patch(`/categories/${nonExistentId}/deactivate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /categories/:id', () => {
    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Test Category', slug: 'test-category' });

      rootCategoryId = response.body.data.data.id;
    });

    it('should soft delete category successfully', async () => {
      await request(app.getHttpServer())
        .delete(`/categories/${rootCategoryId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NO_CONTENT);

      // Verify category is not in the list anymore (soft deleted)
      const listResponse = await request(app.getHttpServer())
        .get('/categories')
        .query({ limit: 100 });

      const categories = listResponse.body.data.data.data;
      const deletedCategory = categories.find((c: any) => c.id === rootCategoryId);
      expect(deletedCategory).toBeUndefined();
    });

    it('should fail to delete without authentication', async () => {
      await request(app.getHttpServer())
        .delete(`/categories/${rootCategoryId}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should return 404 when deleting non-existent category', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

      await request(app.getHttpServer())
        .delete(`/categories/${nonExistentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail to delete category with active children', async () => {
      // Create a child category
      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Child Category', slug: 'child-category', parentId: rootCategoryId });

      // Try to delete parent
      await request(app.getHttpServer())
        .delete(`/categories/${rootCategoryId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });
});
