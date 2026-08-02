import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '@/app/hooks';
import { loadMyHome } from '@/features/home/homeSlice';
import { homeApi } from '@/api/homeApi';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

type Mode = 'choose' | 'create' | 'join';

export default function OnboardingPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('choose');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  
  const [invitations, setInvitations] = useState<{ id: string; homeId: string; homeName: string; role: string }[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);

  useEffect(() => {
    const fetchInvites = async () => {
      try {
        const res = await homeApi.listInvitations();
        setInvitations(res.data.data.invitations);
      } catch (e) {
        // ignore
      } finally {
        setLoadingInvites(false);
      }
    };
    fetchInvites();
  }, []);

  const err = (e: unknown) => {
    const x = e as { response?: { data?: { message?: string } } };
    setError(x.response?.data?.message ?? 'Something went wrong');
  };

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await homeApi.create(name);
      await dispatch(loadMyHome());
      navigate('/');
    } catch (e) {
      err(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await homeApi.join(inviteCode);
      setPending(true);
    } catch (e) {
      err(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptInvite = async (id: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await homeApi.acceptInvitation(id);
      await dispatch(loadMyHome());
      navigate('/');
    } catch (e) {
      err(e);
      setSubmitting(false);
    }
  };

  const handleRejectInvite = async (id: string) => {
    try {
      await homeApi.rejectInvitation(id);
      setInvitations(invitations.filter(i => i.id !== id));
    } catch (e) {
      err(e);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-brand-50 to-white px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-brand-600">MealMate</h1>
          <p className="text-sm text-gray-500 mt-1">Set up your household to get started</p>
        </div>

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        {pending ? (
          <div className="text-center space-y-2">
            <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700">
              Your join request was submitted. An admin needs to approve you before you can access
              the home.
            </p>
          </div>
        ) : mode === 'choose' ? (
          <div className="space-y-3">
            <Button className="w-full" onClick={() => setMode('create')}>
              Create a new home
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setMode('join')}>
              Join with an invite code
            </Button>
          </div>
        ) : mode === 'create' ? (
          <div className="space-y-4">
            <Input
              id="home-name"
              label="Home name"
              placeholder="e.g. Flat 4B"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button className="w-full" loading={submitting} onClick={handleCreate} disabled={name.length < 2}>
              Create home
            </Button>
            <button className="text-sm text-gray-500 w-full" onClick={() => setMode('choose')}>
              Back
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              id="invite-code"
              label="Invite code"
              placeholder="8-character code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            />
            <Button
              className="w-full"
              loading={submitting}
              onClick={handleJoin}
              disabled={inviteCode.length < 4}
            >
              Request to join
            </Button>
            <button className="text-sm text-gray-500 w-full" onClick={() => setMode('choose')}>
              Back
            </button>
          </div>
        )}
      </div>

      {!loadingInvites && invitations.length > 0 && !pending && mode === 'choose' && (
        <div className="w-full max-w-md mt-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider px-1">
            Direct Invitations
          </h2>
          {invitations.map((inv) => (
            <Card key={inv.id} className="bg-white border border-brand-100 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-brand-900">{inv.homeName}</p>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">Role: {inv.role}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" loading={submitting} onClick={() => handleAcceptInvite(inv.id)}>
                    Accept
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleRejectInvite(inv.id)}>
                    Decline
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
