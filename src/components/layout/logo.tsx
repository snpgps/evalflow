import { Rocket } from 'lucide-react';
import Link from 'next/link';

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-3 py-4 text-primary hover:text-primary/90 transition-colors">
      <Rocket className={`h-7 w-7 shrink-0 ${collapsed ? '' : ''}`} />
      {!collapsed && (
        <span className="text-xl font-bold font-headline whitespace-nowrap">
          EvalFlow
        </span>
      )}
    </Link>
  );
}
