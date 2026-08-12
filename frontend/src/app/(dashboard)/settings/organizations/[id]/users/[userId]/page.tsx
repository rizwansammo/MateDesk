'use client';

import { use } from 'react';
import { UserProfileView } from '@/components/users/UserProfileView';
import { useOrganization } from '@/hooks/useOrganizations';

function OrgUserProfile({ orgId, userId }: { orgId: string; userId: string }) {
  const { data: org } = useOrganization(orgId);
  return (
    <UserProfileView
      userId={userId}
      backLabel={org?.name ?? 'Organization'}
      backHref={`/settings/organizations/${orgId}`}
    />
  );
}

export default function Page({ params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id: orgId, userId } = use(params);
  return <OrgUserProfile orgId={orgId} userId={userId} />;
}
