'use client';

import { use } from 'react';
import { UserProfileView } from '@/components/users/UserProfileView';

export default function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <UserProfileView userId={id} backLabel="" />;
}
