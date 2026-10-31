import { useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PageMeta } from '@/components/app/PageMeta/PageMeta';
import { PageLayout } from '@/components/app/PageLayout/PageLayout';
import { createGameWithId, gameIdExists } from '@/lib/game';
import { saveSessionGameId } from '@/lib/sessionGame';
import { Button, Heading, Icon, Input, RuleDivider, Stack, Text } from '@/components/ui';
import styles from './Home.module.css';

export const Home = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sessionId, setSessionId] = useState('');
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');

  const handleOpen = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const id = sessionId.trim();
    if (!id || opening) return;
    setOpening(true);
    setError('');

    try {
      const openGame = (isNew: boolean) => {
        // Store the credential only after Firestore accepts it.
        saveSessionGameId(id);
        navigate('/game', isNew ? { state: { isNew: true } } : undefined);
      };
      const exists = await gameIdExists(id);
      if (!exists) {
        // The first player creates the sole permitted game. Firestore rules
        // reject all other IDs even if clients bypass this UI.
        try {
          await createGameWithId(id);
          openGame(true);
        } catch (err) {
          // Another player may have created the game in the meantime.
          if (!(err instanceof Error && err.message === 'Game ID already taken.')) throw err;
          openGame(false);
        }
      } else {
        openGame(false);
      }
    } catch {
      setError('Invalid session ID or unable to reach the game.');
    } finally {
      setOpening(false);
    }
  }, [sessionId, opening, navigate]);

  return (
    <PageLayout simple>
      <PageMeta
        title="Hearthfire — Stonetop Party Tracker"
        description="Track your Stonetop TTRPG campaign — manage characters, GM playbook, and game sessions."
        url={window.location.origin + location.pathname}
      />
      <div className={styles.page}>
        <div className={styles.hero}>
          <div className={styles.logoWrap}>
            <Icon logoIcon="stonetop" className={styles.logo} />
            <div className={styles.heroText}>
              <Text className={styles.eyebrow}>Party Tracker</Text>
              <Heading as="h1" size="xl" className={styles.wordmark}>Hearthfire</Heading>
            </div>
          </div>
          <RuleDivider className={styles.rule} />
          <Text className={styles.subtitle}>For the Stonetop TTRPG by Jeremy Strandberg</Text>
        </div>

        <div className={styles.cards}>
          <div className={styles.card}>
            <Heading as="h2" size="label">Open Game</Heading>
            <form onSubmit={handleOpen} className={styles.cardBody}>
              <Text color="muted" size="xs">
                Enter your group's private session ID. It's kept in this tab, not in the URL. The game is created the first time it is opened.
              </Text>
              <Stack gap={2}>
                <Input
                  id="session-id"
                  type="password"
                  label="Session ID"
                  placeholder="Shared session ID"
                  value={sessionId}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setSessionId(e.target.value);
                    setError('');
                  }}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Stack>
              {error && <Text color="muted" size="xs" role="alert">{error}</Text>}
              <Button type="submit" size="lg" fullWidth disabled={opening || !sessionId.trim()}>
                {opening ? 'Opening…' : 'Open Game'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};
