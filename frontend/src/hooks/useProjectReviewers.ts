import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface ReviewerCandidate {
  id: string;
  name: string;
  email: string;
  role: 'client_owner' | 'end_user';
}
export function useProjectReviewerCandidates(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['projects', projectId, 'reviewerCandidates'],
    queryFn: () => apiFetch<ReviewerCandidate[]>(
      `/api/projects/${projectId}/reviewer-candidates/`
    ),
    enabled: Boolean(projectId) && enabled,
  });
}