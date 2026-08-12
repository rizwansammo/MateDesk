'use client';

import { useRouter } from 'next/navigation';
import { usePageTransition } from '@/store/usePageTransition';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';

interface TransitionLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> {
  href: string;
  children: ReactNode;
  color?: 'blue' | 'green';
  onNavigate?: () => void;
}

export function TransitionLink({ href, children, color = 'blue', onNavigate, ...rest }: TransitionLinkProps) {
  const router = useRouter();
  const trigger = usePageTransition((s) => s.trigger);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    onNavigate?.();
    trigger(() => router.push(href), color);
  }

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
