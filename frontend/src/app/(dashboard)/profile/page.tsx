'use client';

import { useAuthStore } from '@/store/useAuthStore';
import { UserProfileView } from '@/components/users/UserProfileView';

export default function ProfilePage() {
  const { user } = useAuthStore();
  if (!user?.id) return null;
  return <UserProfileView userId={user.id} isSelf selfEditOnly />;
}
