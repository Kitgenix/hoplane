import { Plus } from 'lucide-react';
import { useLocation } from 'wouter';
import { AnalyticsPanel } from '../components/AnalyticsPanel';
import { PageHeader } from '../components/Layout';
import { Button, Card } from '../components/ui';
import { useSession } from '../lib/hooks';

export function OverviewPage() {
  const { me, can } = useSession();
  const [, navigate] = useLocation();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <>
      <PageHeader
        title={`${greeting}${me.name ? `, ${me.name.split(' ')[0]}` : ''}`}
        description="Here is how your links are performing."
        actions={
          can('links:write') && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate('/links?new=1')}>
              Create link
            </Button>
          )
        }
      />
      {can('analytics:read') ? (
        <AnalyticsPanel />
      ) : (
        <Card>
          <p className="text-sm text-muted">Your role does not include analytics access.</p>
        </Card>
      )}
    </>
  );
}
