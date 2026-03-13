import { ArticleService } from './article.service';
import { IArticleRepository, ArticleWithRelations } from '../repositories/article.repository';
import { ITagRepository } from '../repositories/tag.repository';
import { IProfileRepository } from '../repositories/profile.repository';
import { NotFoundError, AuthorizationError } from '../errors';

describe('ArticleService', () => {
  let articleService: ArticleService;
  let mockArticleRepository: jest.Mocked<IArticleRepository>;
  let mockTagRepository: jest.Mocked<ITagRepository>;
  let mockProfileRepository: jest.Mocked<IProfileRepository>;

  const mockArticle: ArticleWithRelations = {
    id: 1,
    slug: 'test-article',
    title: 'Test Article',
    description: 'Test description',
    body: 'Test body',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    authorId: 1,
    author: {
      id: 1,
      username: 'testuser',
      bio: null,
      image: null
    },
    tags: [
      {
        tag: {
          name: 'testing'
        }
      }
    ],
    favoritedBy: [],
    _count: {
      favoritedBy: 0
    }
  };

  beforeEach(() => {
    mockArticleRepository = {
      findBySlug: jest.fn(),
      findAll: jest.fn(),
      findFeed: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      slugExists: jest.fn(),
      favorite: jest.fn(),
      unfavorite: jest.fn()
    };

    mockTagRepository = {
      findByName: jest.fn(),
      findAll: jest.fn(),
      upsertMany: jest.fn()
    };

    mockProfileRepository = {
      isFollowing: jest.fn(),
      follow: jest.fn(),
      unfollow: jest.fn(),
      getFollowerCount: jest.fn(),
      getFollowingCount: jest.fn()
    };

    articleService = new ArticleService(
      mockArticleRepository,
      mockTagRepository,
      mockProfileRepository
    );
  });

  describe('createArticle', () => {
    it('create_article_with_valid_data_generates_slug_and_returns_article', async () => {
      mockArticleRepository.slugExists.mockResolvedValue(false);
      mockTagRepository.upsertMany.mockResolvedValue([{ id: 1, name: 'testing' }]);
      mockArticleRepository.create.mockResolvedValue(mockArticle);
      mockProfileRepository.isFollowing.mockResolvedValue(false);

      const result = await articleService.createArticle(
        {
          title: 'Test Article',
          description: 'Test description',
          body: 'Test body',
          tagList: ['testing']
        },
        1
      );

      expect(result.slug).toBe('test-article');
      expect(result.title).toBe('Test Article');
      expect(result.tagList).toEqual(['testing']);
    });

    it('create_article_with_duplicate_slug_appends_counter', async () => {
      mockArticleRepository.slugExists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      mockTagRepository.upsertMany.mockResolvedValue([]);
      mockArticleRepository.create.mockResolvedValue({
        ...mockArticle,
        slug: 'test-article-2'
      });
      mockProfileRepository.isFollowing.mockResolvedValue(false);

      const result = await articleService.createArticle(
        {
          title: 'Test Article',
          description: 'Test',
          body: 'Test'
        },
        1
      );

      expect(mockArticleRepository.slugExists).toHaveBeenCalledWith('test-article');
      expect(mockArticleRepository.slugExists).toHaveBeenCalledWith('test-article-2');
    });
  });

  describe('getArticle', () => {
    it('get_existing_article_returns_article_with_author', async () => {
      mockArticleRepository.findBySlug.mockResolvedValue(mockArticle);
      mockProfileRepository.isFollowing.mockResolvedValue(false);

      const result = await articleService.getArticle('test-article');

      expect(result.slug).toBe('test-article');
      expect(result.author.username).toBe('testuser');
    });

    it('get_nonexistent_article_throws_not_found_error', async () => {
      mockArticleRepository.findBySlug.mockResolvedValue(null);

      await expect(articleService.getArticle('nonexistent')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('updateArticle', () => {
    it('update_article_by_author_succeeds', async () => {
      mockArticleRepository.findBySlug.mockResolvedValue(mockArticle);
      mockArticleRepository.update.mockResolvedValue({
        ...mockArticle,
        title: 'Updated Title'
      });
      mockProfileRepository.isFollowing.mockResolvedValue(false);

      const result = await articleService.updateArticle(
        'test-article',
        { title: 'Updated Title' },
        1
      );

      expect(result.title).toBe('Updated Title');
    });

    it('update_article_by_non_author_throws_authorization_error', async () => {
      mockArticleRepository.findBySlug.mockResolvedValue(mockArticle);

      await expect(
        articleService.updateArticle('test-article', { title: 'Updated' }, 999)
      ).rejects.toThrow(AuthorizationError);
    });

    it('update_article_title_generates_new_slug', async () => {
      mockArticleRepository.findBySlug.mockResolvedValue(mockArticle);
      mockArticleRepository.slugExists.mockResolvedValue(false);
      mockArticleRepository.update.mockResolvedValue({
        ...mockArticle,
        slug: 'new-title',
        title: 'New Title'
      });
      mockProfileRepository.isFollowing.mockResolvedValue(false);

      await articleService.updateArticle(
        'test-article',
        { title: 'New Title' },
        1
      );

      expect(mockArticleRepository.update).toHaveBeenCalledWith(
        'test-article',
        expect.objectContaining({ newSlug: 'new-title' })
      );
    });
  });

  describe('deleteArticle', () => {
    it('delete_article_by_author_succeeds', async () => {
      mockArticleRepository.findBySlug.mockResolvedValue(mockArticle);
      mockArticleRepository.delete.mockResolvedValue();

      await articleService.deleteArticle('test-article', 1);

      expect(mockArticleRepository.delete).toHaveBeenCalledWith('test-article');
    });

    it('delete_article_by_non_author_throws_authorization_error', async () => {
      mockArticleRepository.findBySlug.mockResolvedValue(mockArticle);

      await expect(
        articleService.deleteArticle('test-article', 999)
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('favoriteArticle', () => {
    it('favorite_article_updates_favorited_status', async () => {
      mockArticleRepository.findBySlug
        .mockResolvedValueOnce(mockArticle)
        .mockResolvedValueOnce({
          ...mockArticle,
          favoritedBy: [{ userId: 1 }],
          _count: { favoritedBy: 1 }
        });
      mockArticleRepository.favorite.mockResolvedValue();
      mockProfileRepository.isFollowing.mockResolvedValue(false);

      const result = await articleService.favoriteArticle('test-article', 1);

      expect(result.favorited).toBe(true);
      expect(result.favoritesCount).toBe(1);
    });
  });

  describe('unfavoriteArticle', () => {
    it('unfavorite_article_updates_favorited_status', async () => {
      mockArticleRepository.findBySlug
        .mockResolvedValueOnce(mockArticle)
        .mockResolvedValueOnce(mockArticle);
      mockArticleRepository.unfavorite.mockResolvedValue();
      mockProfileRepository.isFollowing.mockResolvedValue(false);

      const result = await articleService.unfavoriteArticle('test-article', 1);

      expect(result.favorited).toBe(false);
      expect(result.favoritesCount).toBe(0);
    });
  });
});
