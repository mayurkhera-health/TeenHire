import { PostDraftProvider } from '@/components/PostDraft';

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return <PostDraftProvider>{children}</PostDraftProvider>;
}
