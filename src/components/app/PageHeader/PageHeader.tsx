import { useState, useRef, useEffect, useCallback, useId } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Heading,
  Input,
  Text,
  RuleDivider,
  Tooltip,
} from "@/components/ui";
import { useToast } from "@/components/app";
import { PageNav } from "./PageNav";
import { SaveStatus } from '@/components/app/SaveStatus/SaveStatus';
import { useSaveStatusActionsOptional } from '@/components/app/SaveStatus/SaveStatusContext';
import { ThemeToggle } from "./ThemeToggle";
import type { GameNav } from "./gameNav";
import { SiteBanner } from "@/components/app/SiteBanner/SiteBanner";
import { SITE_BANNER } from "@/lib/siteBanner";
import { getConfiguredMiroBoardUrl } from "@/lib/miroBoard";
import styles from "./PageHeader.module.css";

/*
 * PageHeader — the semantic <header> landmark at the top of every page.
 * It contains up to three visual layers, rendered top to bottom:
 *
 *   1. SiteBanner — a site-wide notification strip (e.g. "Under Construction").
 *                   Optional — only rendered when there is something to say.
 *                   Always shown regardless of simple mode, because it carries
 *                   important information every visitor needs to see.
 *
 *   2. TopBar     — the "Hearthfire" wordmark strip. Identifies the app on
 *                   every full page. Not shown in simple mode (Home, NotFound)
 *                   where the page has its own hero treatment.
 *
 *   3. Page identity — page switcher, page title (optionally inline-editable),
 *                   optional subtitle, game ID with copy button, and a decorative
 *                   rule divider. Only shown in full mode.
 *
 * Props come in two shapes (TypeScript discriminated union):
 *
 *   simple={true}  — Home and NotFound. Renders SiteBanner only.
 *                    No wordmark, no switcher, no title, no game ID.
 *
 *   simple={false} (default) — All inner pages. Renders all three layers.
 *                    Title is read-only unless onSaveTitle + titleLabel are
 *                    provided, in which case an inline edit button appears.
 */

type SimpleProps = {
  simple: true;
};

type FullProps = {
  simple?: false;
  title: string;
  subtitle?: string;
  icon?: React.ReactElement<SVGSVGElement>;
  gameId: string;
  nav?: GameNav;
  // Page-specific controls rendered alongside the game ID. A slot rather than a
  // flag so PageHeader stays generic: only the page that owns a control passes
  // one, and no gating is needed to keep it off the pages that don't.
  actions?: React.ReactNode;
} & (
  | { onSaveTitle: (value: string) => Promise<void>; titleLabel: string }
  | { onSaveTitle?: never; titleLabel?: never }
);

type Props = SimpleProps | FullProps;

export const PageHeader = (props: Props) => {
  const { simple } = props;
  const miroBoardUrl = getConfiguredMiroBoardUrl();

  /*
   * All the editing/copy state below is only used in full mode.
   * Hooks must always be called unconditionally in React, so we declare
   * them here even though simple mode never touches them.
   */
  const { addToast } = useToast();
  const draftStatus = useSaveStatusActionsOptional();
  const draftId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);
  const savingRef = useRef(false);
  const editSaveRef = useRef<((value: string) => Promise<void>) | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editBtnRef = useRef<HTMLButtonElement>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set just before a keyboard-driven commit/cancel so the focus-return in `commit` only fires
  // for Enter, not for a blur caused by clicking or tabbing to another element — otherwise we'd
  // steal focus from wherever the user was headed.
  const committingViaKeyboardRef = useRef(false);
  const editTooltipId = useId();
  const copyTooltipId = useId();
  const navDropdownId = useId();

  useEffect(() => {
    draftStatus?.reportDraft(draftId, editing);
    return () => draftStatus?.reportDraft(draftId, false);
  }, [draftStatus, draftId, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    } else if (committingViaKeyboardRef.current) {
      committingViaKeyboardRef.current = false;
      editBtnRef.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const startEditing = useCallback(() => {
    if (simple) return;
    setValue((props as FullProps).title);
    // Keep the mutation's opening snapshot, even if another tab renames the
    // same item while this input is open.
    editSaveRef.current = (props as FullProps).onSaveTitle;
    setEditing(true);
  }, [simple, props]);

  const commit = useCallback(async () => {
    if (simple || savingRef.current) return;
    const fullProps = props as FullProps;
    const trimmed = value.trim();
    savingRef.current = true;
    setSaving(true);
    try {
      if (trimmed && trimmed !== fullProps.title) await editSaveRef.current?.(trimmed);
      setEditing(false);
    } catch {
      committingViaKeyboardRef.current = false;
      addToast("Could not preserve this name. Keep the draft open and retry.", "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [simple, props, value, addToast]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        committingViaKeyboardRef.current = true;
        commit();
      }
      if (e.key === "Escape") {
        committingViaKeyboardRef.current = true;
        setEditing(false);
      }
    },
    [commit],
  );

  const copyGameId = useCallback(() => {
    if (simple) return;
    const { gameId } = props as FullProps;
    navigator.clipboard
      .writeText(gameId)
      .then(() => {
        setCopied(true);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => addToast("Failed to copy game ID.", "error"));
  }, [simple, props, addToast]);

  const copyLabel = copied ? "Copied!" : "Copy session ID";

  /*
   * Page identity block — only built in full mode, kept as a variable
   * so the JSX below stays readable without an IIFE.
   */
  let pageIdentity: React.ReactNode = null;
  if (!simple) {
    const { title, subtitle, icon, nav, actions } = props as FullProps;
    const onSaveTitle = (props as FullProps).onSaveTitle;
    const titleLabel = (props as FullProps).titleLabel;

    pageIdentity = (
      <div className={styles.body}>
        {nav && (
          <div className={styles.navRow}>
            <PageNav nav={nav} dropdownId={navDropdownId} />
          </div>
        )}
        <div className={styles.titleRow}>
          {icon && (
            <span className={styles.titleIcon} aria-hidden="true">
              {icon}
            </span>
          )}
          {onSaveTitle && editing ? (
            <Input
              ref={inputRef as React.Ref<HTMLInputElement>}
              className={styles.titleInput}
              value={value}
              readOnly={saving}
              onChange={handleChange}
              onBlur={commit}
              onKeyDown={handleKeyDown}
              aria-label={titleLabel}
            />
          ) : (
            <>
              <Heading as="h2" size="xl">
                {title}
              </Heading>
              {onSaveTitle && (
                <Tooltip
                  text="Edit name"
                  side="top"
                  noTabStop
                  tooltipId={editTooltipId}
                >
                  <Button
                    ref={editBtnRef}
                    variant="ghost"
                    icon="pencil"
                    size="sm"
                    className={styles.editBtn}
                    onClick={startEditing}
                    aria-label={titleLabel!}
                    aria-describedby={editTooltipId}
                  />
                </Tooltip>
              )}
            </>
          )}
        </div>
        {subtitle && (
          <Text color="muted" size="xs" className={styles.subtitle}>
            {subtitle}
          </Text>
        )}
        <div className={styles.gameId}>
          <Text color="muted" size="xs">
            Private session
          </Text>
          <Tooltip
            text={copyLabel}
            side="top"
            noTabStop
            tooltipId={copyTooltipId}
          >
            <Button
              variant="ghost"
              icon={copied ? "check" : "copy"}
              size="sm"
              className={styles.copyBtn}
              onClick={copyGameId}
              aria-label={copyLabel}
              aria-describedby={copyTooltipId}
            />
          </Tooltip>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
        <RuleDivider className={styles.rule} />
      </div>
    );
  }

  return (
    /*
     * <header> is the correct semantic landmark here — it wraps the entire
     * top-of-page identity block, not just the wordmark strip.
     */
    <header className={styles.header}>

      {SITE_BANNER && <SiteBanner>{SITE_BANNER}</SiteBanner>}

      {/*
       * TopBar — the "Hearthfire" wordmark strip.
       * Only shown in full mode. Simple pages (Home, NotFound) have their
       * own hero treatment and don't need the wordmark here.
       */}
      {!simple && (
        <div className={styles.topBar}>
          <Heading as="h1" size="md" className={styles.wordmark}>
            <Link to="/" className={styles.wordmarkLink}>Hearthfire</Link>
          </Heading>
          <div className={styles.topBarActions}>
            <SaveStatus />
            {miroBoardUrl && (
              <a
                href={miroBoardUrl}
                className={styles.mapLink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open shared map in Miro (new tab)"
              >
                Map
              </a>
            )}
            <ThemeToggle />
          </div>
        </div>
      )}

      {/*
       * Page identity — page switcher, title, game ID, rule divider.
       * Only rendered in full mode.
       */}
      {pageIdentity}
    </header>
  );
};
