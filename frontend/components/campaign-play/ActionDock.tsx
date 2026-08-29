"use client";

import type { KeyboardEvent, ReactNode, RefObject } from "react";
import type {
  CampaignPlayCommitmentBinding,
  CampaignPlayDecisionBinding,
  CampaignPlayObligationBinding,
  CampaignPlaySuggestedAction,
} from "@worldforge/shared";

export interface ActionDockProps {
  draft: string;
  inputLocked: boolean;
  journalOpen: boolean;
  journalTriggerRef: RefObject<HTMLButtonElement | null>;
  pendingAdmission: boolean;
  statusSlot?: ReactNode;
  suggestedActions: CampaignPlaySuggestedAction[];
  utilityActions: CampaignPlaySuggestedAction[];
  suggestionsHeadingRef: RefObject<HTMLHeadingElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onJournalOpen: () => void;
  onSubmitFreeform: () => void;
  onSubmitSuggested: (
    choiceHandle: string,
    decisionBinding?: CampaignPlayDecisionBinding,
    commitmentBinding?: CampaignPlayCommitmentBinding,
    obligationBinding?: CampaignPlayObligationBinding,
  ) => void;
}

const CHOICE_KEYS = ["a", "b", "c", "d"] as const;

export function ActionDock({
  draft,
  inputLocked,
  journalOpen,
  journalTriggerRef,
  pendingAdmission,
  statusSlot,
  suggestedActions,
  utilityActions,
  suggestionsHeadingRef,
  textareaRef,
  onDraftChange,
  onJournalOpen,
  onSubmitFreeform,
  onSubmitSuggested,
}: ActionDockProps) {
  const submitFromKeyboard = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!inputLocked && draft.trim().length > 0) onSubmitFreeform();
  };

  return (
    <section className="campaign-play-action-dock">
      {statusSlot}
      {suggestedActions.length > 0 ? (
        <div className="campaign-play-choices">
          <h2 ref={suggestionsHeadingRef} tabIndex={-1}>Your move</h2>
          <div>
            {suggestedActions.map((action, index) => (
              <button
                data-choice-handle={action.choiceHandle}
                disabled={inputLocked}
                key={action.choiceHandle}
                onClick={() => {
                  if (action.decisionBinding !== undefined) {
                    onSubmitSuggested(action.choiceHandle, action.decisionBinding, action.commitmentBinding);
                  } else if (action.commitmentBinding !== undefined) {
                    onSubmitSuggested(action.choiceHandle, undefined, action.commitmentBinding);
                  } else if (action.obligationBinding !== undefined) {
                    onSubmitSuggested(action.choiceHandle, undefined, undefined, action.obligationBinding);
                  } else {
                    onSubmitSuggested(action.choiceHandle);
                  }
                }}
                type="button"
              >
                <span aria-hidden="true">{CHOICE_KEYS[index] ?? "·"}.</span>
                <strong>{action.label}</strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {utilityActions.length > 0 ? (
        <div className="campaign-play-utility-actions">
          {utilityActions.map((action) => (
            <button
              className="campaign-play-utility-action"
              data-choice-handle={action.choiceHandle}
              disabled={inputLocked}
              key={action.choiceHandle}
              onClick={() => {
                if (action.decisionBinding !== undefined) {
                  onSubmitSuggested(action.choiceHandle, action.decisionBinding, action.commitmentBinding);
                } else if (action.commitmentBinding !== undefined) {
                  onSubmitSuggested(action.choiceHandle, undefined, action.commitmentBinding);
                } else if (action.obligationBinding !== undefined) {
                  onSubmitSuggested(action.choiceHandle, undefined, undefined, action.obligationBinding);
                } else {
                  onSubmitSuggested(action.choiceHandle);
                }
              }}
              type="button"
            >
              <span aria-hidden="true">◷</span>
              <strong>{action.label}</strong>
            </button>
          ))}
        </div>
      ) : null}
      <div className="campaign-play-action-shell">
        <div className="campaign-play-action-heading">
          <label htmlFor="campaign-play-action">Your action</label>
          <button
            aria-controls="campaign-play-journal"
            aria-expanded={journalOpen}
            className="campaign-play-journal-trigger"
            onClick={onJournalOpen}
            ref={journalTriggerRef}
            type="button"
          >
            <span aria-hidden="true">❦</span>
            Journal
          </button>
        </div>
        <div className="campaign-play-action-entry">
          <textarea
            disabled={inputLocked}
            id="campaign-play-action"
            maxLength={2000}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={submitFromKeyboard}
            placeholder="What do you do?"
            ref={textareaRef}
            value={draft}
          />
          <button
            disabled={inputLocked || draft.trim().length === 0}
            onClick={onSubmitFreeform}
            type="button"
          >
            {pendingAdmission ? "Sending" : "Act"}
          </button>
        </div>
        <small>Enter to act · Shift+Enter for a new line</small>
      </div>
    </section>
  );
}

export default ActionDock;
