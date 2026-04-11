import TournamentPageContent from '@/components/classic/TournamentPageContent';

export function generateStaticParams() {
  // Return a placeholder to satisfy static export — actual tournament IDs are resolved at runtime
  return [{ 'tournament-id': '_' }];
}

export default function Page() {
  return <TournamentPageContent />;
}
