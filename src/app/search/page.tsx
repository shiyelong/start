'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Header from '@/components/layout/Header';
import SearchHub from '@/components/search/SearchHub';
import type { SourceType } from '@/lib/types';

const VALID_TYPES: SourceType[] = ['video', 'music', 'comic', 'novel', 'anime', 'live', 'podcast'];

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const typeParam = searchParams.get('type') ?? '';
  const filterType = VALID_TYPES.includes(typeParam as SourceType)
    ? (typeParam as SourceType)
    : undefined;

  return (
    <SearchHub initialQuery={initialQuery} filterType={filterType} />
  );
}

export default function SearchPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0f0f0f] text-white px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-[#3ea6ff] mb-6">全局搜索</h1>
          <Suspense fallback={<div className="text-gray-400">加载中...</div>}>
            <SearchContent />
          </Suspense>
        </div>
      </main>
    </>
  );
}
