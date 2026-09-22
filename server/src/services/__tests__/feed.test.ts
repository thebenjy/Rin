import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { FeedService } from '../feed';
import { Hono } from "hono";
import type { Variables } from "../../core/hono-types";
import { setupTestApp, createTestUser, cleanupTestDB } from '../../../tests/fixtures';
import type { Database } from 'bun:sqlite';
import type { TestCacheImpl } from '../../../tests/fixtures';

describe('FeedService', () => {
    let db: any;
    let sqlite: Database;
    let env: Env;
    let app: Hono<{ Bindings: Env; Variables: Variables }>;
    let cache: TestCacheImpl;
    let serverConfig: TestCacheImpl;
    let clientConfig: TestCacheImpl;

    beforeEach(async () => {
        const ctx = await setupTestApp(FeedService);
        db = ctx.db;
        sqlite = ctx.sqlite;
        env = ctx.env;
        app = ctx.app;
        cache = ctx.cache;
        serverConfig = ctx.serverConfig;
        clientConfig = ctx.clientConfig;
        
        // Create test user
        await createTestUser(sqlite);
    });

    afterEach(() => {
        cleanupTestDB(sqlite);
    });



    describe('GET / - List feeds', () => {
        it('should list published feeds', async () => {
            // Create feeds via API
            const res1 = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Test Feed 1',
                    content: 'Content 1',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            expect(res1.status).toBe(200);
            
            const res2 = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Test Feed 2',
                    content: 'Content 2',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            expect(res2.status).toBe(200);
            
            const listRes = await app.request('/?page=1&limit=10', { method: 'GET' }, env);
            
            expect(listRes.status).toBe(200);
            const data = await listRes.json() as any;
            expect(data.size).toBe(2);
            expect(data.data).toBeArray();
        });

        it('should return empty list when no feeds exist', async () => {
            const res = await app.request('/', { method: 'GET' }, env);
            
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.size).toBe(0);
            expect(data.data).toEqual([]);
        });

        it('should filter drafts for non-admin users', async () => {
            // Create a draft feed
            await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Draft Feed',
                    content: 'Draft Content',
                    listed: true,
                    draft: true,
                    tags: [],
                }),
            }, env);
            
            const res = await app.request('/?type=draft', { method: 'GET' }, env);
            
            expect(res.status).toBe(403);
        });

        it('should allow admin to view drafts', async () => {
            // Create a draft feed
            await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Draft Feed',
                    content: 'Draft Content',
                    listed: true,
                    draft: true,
                    tags: [],
                }),
            }, env);
            
            const res = await app.request('/?type=draft', {
                method: 'GET',
                headers: { 'Authorization': 'Bearer mock_token_1' },
            }, env);
            
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.size).toBe(1);
        });
    });

    describe('GET /:id - Get single feed', () => {
        it('should return feed by id', async () => {
            // Create a feed first
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Test Feed',
                    content: 'Test Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            
            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;
            
            const getRes = await app.request(`/${feedId}`, { method: 'GET' }, env);
            
            expect(getRes.status).toBe(200);
            const data = await getRes.json() as any;
            expect(data.title).toBe('Test Feed');
        });

        it('should return AI summary generation status for a queued feed', async () => {
            await serverConfig.set('ai_summary.enabled', 'true', false);
            await serverConfig.set('ai_summary.provider', 'worker-ai', false);
            await serverConfig.set('ai_summary.model', 'llama-3-8b', false);

            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Queued AI Feed',
                    content: 'Queued AI content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            const createData = await createRes.json() as any;
            const getRes = await app.request(`/${createData.insertedId}`, { method: 'GET' }, env);

            expect(getRes.status).toBe(200);
            const data = await getRes.json() as any;
            expect(data.ai_summary_status).toBe('pending');
            expect(data.ai_summary_error).toBe('');
        });

        it('should return 404 for non-existent feed', async () => {
            const res = await app.request('/9999', { method: 'GET' }, env);
            
            expect(res.status).toBe(404);
        });

        it('should bypass stale public cache when cache is disabled', async () => {
            await clientConfig.set('cache.enabled', false);
            await clientConfig.set('counter.enabled', false);

            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Fresh Feed',
                    content: 'Fresh Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            const createData = await createRes.json() as any;
            await cache.set(`feed_${createData.insertedId}`, {
                id: createData.insertedId,
                title: 'Stale Feed',
                content: 'stale',
                summary: '',
                ai_summary: '',
                ai_summary_status: 'idle',
                ai_summary_error: '',
                draft: 0,
                listed: 1,
                uid: 1,
                alias: null,
                hashtags: [],
                user: { id: 1, username: 'testuser', avatar: 'avatar.png' },
            });

            const getRes = await app.request(`/${createData.insertedId}`, { method: 'GET' }, env);
            const data = await getRes.json() as any;

            expect(data.title).toBe('Fresh Feed');
        });
    });

    describe('POST / - Create feed', () => {
        it('should create feed with admin permission', async () => {
            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'New Test Feed',
                    content: 'This is a new test feed content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.insertedId).toBeDefined();
        });

        it('should require admin permission', async () => {
            // Create app without admin permission
            const res = await app.request('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Test',
                    content: 'Test',
                    tags: [],
                    draft: false,
                    listed: true,
                }),
            }, env);

            expect(res.status).toBe(403);
        });

        it('should require title', async () => {
            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: 'Content without title',
                    tags: [],
                    draft: false,
                    listed: true,
                }),
            }, env);

            expect(res.status).toBe(400);
        });

        it('should require content', async () => {
            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Test',
                    content: '',
                    tags: [],
                }),
            }, env);

            expect(res.status).toBe(400);
        });
    });

    describe('POST / - Create feed generates an alias from the title', () => {
        it('stores a title-derived alias when none is supplied', async () => {
            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Waking up with heartburn on Ozempic?',
                    content: 'Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            expect(res.status).toBe(200);
            const data = await res.json() as any;
            const getRes = await app.request(`/${data.insertedId}`, { method: 'GET' }, env);
            const feed = await getRes.json() as any;
            expect(feed.alias).toBe('waking-up-with-heartburn-on-ozempic');
        });

        it('uses a supplied alias verbatim instead of generating one', async () => {
            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'A Title',
                    alias: 'my-own-slug',
                    content: 'Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            const data = await res.json() as any;
            const getRes = await app.request(`/${data.insertedId}`, { method: 'GET' }, env);
            const feed = await getRes.json() as any;
            expect(feed.alias).toBe('my-own-slug');
        });

        it('disambiguates two posts whose titles would slugify the same', async () => {
            const create = (title: string, content: string) => app.request('/', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content, listed: true, draft: false, tags: [] }),
            }, env);

            const first = await (await create('Ozempic Basics', 'First post content')).json() as any;
            const second = await (await create('Ozempic Basics!', 'Second post content')).json() as any;

            const firstFeed = await (await app.request(`/${first.insertedId}`, { method: 'GET' }, env)).json() as any;
            const secondFeed = await (await app.request(`/${second.insertedId}`, { method: 'GET' }, env)).json() as any;

            expect(firstFeed.alias).toBe('ozempic-basics');
            expect(secondFeed.alias).toBe('ozempic-basics-2');
        });

        it('falls back to no alias when the title slugifies to a reserved route name', async () => {
            const res = await app.request('/', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'Login', content: 'Content', listed: true, draft: false, tags: [] }),
            }, env);

            const data = await res.json() as any;
            const getRes = await app.request(`/${data.insertedId}`, { method: 'GET' }, env);
            const feed = await getRes.json() as any;
            expect(feed.alias).toBeFalsy();
        });
    });

    describe('POST /:id - Update feed', () => {
        it('should update feed with admin permission', async () => {
            // Create feed first
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Original Title',
                    content: 'Original Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            
            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;
            
            const updateRes = await app.request(`/${feedId}`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Updated Title',
                    content: 'Updated content',
                    listed: true,
                }),
            }, env);

            expect(updateRes.status).toBe(200);
            
            // Verify update
            const getRes = await app.request(`/${feedId}`, { method: 'GET' }, env);
            const data = await getRes.json() as any;
            expect(data.title).toBe('Updated Title');
        });

        it('should require admin permission to update', async () => {
            // Create feed first
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Original',
                    content: 'Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            
            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;
            
            const updateRes = await app.request(`/${feedId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'New Title',
                    listed: true,
                }),
            }, env);

            expect(updateRes.status).toBe(403);
        });
    });

    describe('POST /:id - Update feed does not disturb an existing alias', () => {
        it('keeps a title-generated alias when a later save changes the title but omits the alias field', async () => {
            const createRes = await app.request('/', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Original Heartburn Title',
                    content: 'Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            const feedId = (await createRes.json() as any).insertedId;

            const original = await (await app.request(`/${feedId}`, { method: 'GET' }, env)).json() as any;
            expect(original.alias).toBe('original-heartburn-title');

            await app.request(`/${feedId}`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'A Completely Different Title', listed: true }),
            }, env);

            const updated = await (await app.request(`/${feedId}`, { method: 'GET' }, env)).json() as any;
            expect(updated.alias).toBe('original-heartburn-title');
        });

        it('keeps an author-supplied alias across an unrelated update', async () => {
            const createRes = await app.request('/', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'A Title', alias: 'hand-picked-slug', content: 'Content', listed: true, draft: false, tags: [],
                }),
            }, env);
            const feedId = (await createRes.json() as any).insertedId;

            await app.request(`/${feedId}`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'A Title', summary: 'now with a summary', listed: true }),
            }, env);

            const updated = await (await app.request(`/${feedId}`, { method: 'GET' }, env)).json() as any;
            expect(updated.alias).toBe('hand-picked-slug');
        });

        it('generates an alias on update for a post that has never had one', async () => {
            const createRes = await app.request('/', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'Login', content: 'Content', listed: true, draft: false, tags: [] }),
            }, env);
            const feedId = (await createRes.json() as any).insertedId;
            expect((await (await app.request(`/${feedId}`, { method: 'GET' }, env)).json() as any).alias).toBeFalsy();

            await app.request(`/${feedId}`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer mock_token_1', 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'A Proper Title Now', listed: true }),
            }, env);

            const updated = await (await app.request(`/${feedId}`, { method: 'GET' }, env)).json() as any;
            expect(updated.alias).toBe('a-proper-title-now');
        });
    });

    describe('DELETE /:id - Delete feed', () => {
        it('should delete feed with admin permission', async () => {
            // Create feed first
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'To Delete',
                    content: 'Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            
            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;
            
            const deleteRes = await app.request(`/${feedId}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer mock_token_1' },
            }, env);

            expect(deleteRes.status).toBe(200);
            
            // Verify deletion
            const getRes = await app.request(`/${feedId}`, { method: 'GET' }, env);
            expect(getRes.status).toBe(404);
        });

        it('should require admin permission to delete', async () => {
            // Create feed first
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Test',
                    content: 'Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            
            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;
            
            const deleteRes = await app.request(`/${feedId}`, { method: 'DELETE' }, env);

            expect(deleteRes.status).toBe(403);
        });

        it('should return 404 for non-existent feed', async () => {
            const res = await app.request('/9999', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer mock_token_1' },
            }, env);

            expect(res.status).toBe(404);
        });
    });
});
