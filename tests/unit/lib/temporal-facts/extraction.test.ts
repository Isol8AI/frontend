import { describe, it, expect } from 'vitest';
import { extractFactsSimple } from '@/lib/temporal-facts/extraction';

describe('extractFactsSimple', () => {
  describe('preference patterns', () => {
    it('extracts "I prefer X" pattern', () => {
      const facts = extractFactsSimple(
        'I prefer TypeScript over JavaScript',
        'That makes sense, TypeScript has great type safety.'
      );

      expect(facts).toContainEqual(
        expect.objectContaining({
          subject: 'user',
          predicate: 'prefers',
          object: expect.stringContaining('typescript'),
        })
      );
    });

    it('extracts "I like X" pattern', () => {
      const facts = extractFactsSimple(
        'I like dark mode in my editors',
        'Dark mode is easier on the eyes.'
      );

      expect(facts).toContainEqual(
        expect.objectContaining({
          subject: 'user',
          predicate: 'prefers',
          object: expect.stringContaining('dark'),
        })
      );
    });

    it('extracts "I love X" pattern', () => {
      const facts = extractFactsSimple(
        'I love Python for data analysis',
        'Python is excellent for that use case.'
      );

      expect(facts).toContainEqual(
        expect.objectContaining({
          subject: 'user',
          predicate: 'prefers',
          object: expect.stringContaining('python'),
        })
      );
    });

    it('extracts "my favorite is X" pattern', () => {
      const facts = extractFactsSimple(
        'My favorite language is Rust',
        'Rust has great memory safety features.'
      );

      expect(facts).toContainEqual(
        expect.objectContaining({
          subject: 'user',
          predicate: 'prefers',
          object: expect.stringContaining('rust'),
        })
      );
    });
  });

  describe('work patterns', () => {
    it('extracts "I work at X" pattern', () => {
      const facts = extractFactsSimple(
        'I work at Google',
        'That sounds like an exciting place to work!'
      );

      expect(facts).toContainEqual(
        expect.objectContaining({
          subject: 'user',
          predicate: 'works_at',
          object: expect.stringContaining('google'),
        })
      );
    });

    it('extracts "I work for X" pattern', () => {
      const facts = extractFactsSimple(
        'I work for a startup called Acme',
        'Startups can be very rewarding.'
      );

      expect(facts).toContainEqual(
        expect.objectContaining({
          subject: 'user',
          predicate: 'works_at',
        })
      );
    });
  });

  describe('location patterns', () => {
    it('extracts "I live in X" pattern', () => {
      const facts = extractFactsSimple(
        'I live in San Francisco',
        'San Francisco has a great tech scene.'
      );

      expect(facts).toContainEqual(
        expect.objectContaining({
          subject: 'user',
          predicate: 'located_in',
          object: expect.stringContaining('san'),
        })
      );
    });

    it('extracts "I\'m from X" pattern', () => {
      const facts = extractFactsSimple(
        "I'm from New York",
        'New York is a vibrant city.'
      );

      expect(facts).toContainEqual(
        expect.objectContaining({
          subject: 'user',
          predicate: 'located_in',
        })
      );
    });

    it('extracts "I\'m in X" pattern', () => {
      const facts = extractFactsSimple(
        "I'm in Seattle right now",
        'Seattle has beautiful weather in summer.'
      );

      expect(facts).toContainEqual(
        expect.objectContaining({
          subject: 'user',
          predicate: 'located_in',
          object: expect.stringContaining('seattle'),
        })
      );
    });
  });

  describe('deduplication', () => {
    it('removes duplicate facts', () => {
      const facts = extractFactsSimple(
        'I prefer TypeScript. I really prefer TypeScript.',
        'TypeScript is indeed great.'
      );

      const typeScriptFacts = facts.filter(
        (f) => f.object.toLowerCase().includes('typescript')
      );
      expect(typeScriptFacts.length).toBeLessThanOrEqual(1);
    });
  });

  describe('no extraction cases', () => {
    it('returns empty array for generic conversation', () => {
      const facts = extractFactsSimple(
        'What is the weather like today?',
        "I don't have access to real-time weather data."
      );

      expect(facts).toHaveLength(0);
    });

    it('returns empty array for questions without personal info', () => {
      const facts = extractFactsSimple(
        'How do I write a for loop in Python?',
        "You can use 'for i in range(10):' syntax."
      );

      expect(facts).toHaveLength(0);
    });
  });

  describe('confidence values', () => {
    it('assigns confidence values to extracted facts', () => {
      const facts = extractFactsSimple(
        'I prefer TypeScript',
        'Good choice!'
      );

      expect(facts.length).toBeGreaterThan(0);
      facts.forEach((fact) => {
        expect(fact.confidence).toBeGreaterThan(0);
        expect(fact.confidence).toBeLessThanOrEqual(1);
      });
    });
  });
});
