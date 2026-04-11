import EmulatorSessionPage from '@/components/classic/EmulatorSessionPage';

export function generateStaticParams() {
  return [{ 'rom-id': '_' }];
}

export default function Page() {
  return <EmulatorSessionPage />;
}
