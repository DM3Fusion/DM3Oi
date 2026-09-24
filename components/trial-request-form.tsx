"use client";

import Link from "next/link";
import { useState } from "react";

import { submitTrialRequest } from "@/app/request-trial/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";

import {
  estimatedUserOptions,
  trialRequestUseCaseLabels,
  trialRequestUseCases,
} from "@/lib/trial-requests";

export function TrialRequestForm() {
  const [useCase, setUseCase] = useState("");
  const [phone, setPhone] = useState("");

  function formatUsPhone(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 10);

    if (digits.length === 0) return "";
    if (digits.length < 4) return `(${digits}`;

    if (digits.length < 7) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    }

    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return (
    <form action={submitTrialRequest} className="trial-request-form">
      <p className="trial-request-required-note">
        <span aria-hidden="true">*</span> Required fields
      </p>

      <div className="trial-request-form-grid">
        <label>
          <span>
            Business / Company Name{" "}
            <span
              className="trial-request-required"
              aria-hidden="true"
            >
              *
            </span>
          </span>

          <input
            name="businessName"
            required
            maxLength={120}
            autoComplete="organization"
          />
        </label>

        <label>
          <span>
            Contact Name{" "}
            <span
              className="trial-request-required"
              aria-hidden="true"
            >
              *
            </span>
          </span>

          <input
            name="contactName"
            required
            maxLength={100}
            autoComplete="name"
          />
        </label>

        <label>
          <span>
            Business Email{" "}
            <span
              className="trial-request-required"
              aria-hidden="true"
            >
              *
            </span>
          </span>

          <input
            name="businessEmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>

        <label>
          Phone{" "}
          <span className="trial-request-optional">
            (optional)
          </span>

          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={14}
            placeholder="(555) 555-1212"
            value={phone}
            onChange={(event) =>
              setPhone(formatUsPhone(event.target.value))
            }
          />
        </label>

        <label>
          <span>
            Primary Operational Need{" "}
            <span
              className="trial-request-required"
              aria-hidden="true"
            >
              *
            </span>
          </span>

          <select
            name="primaryUseCase"
            required
            value={useCase}
            onChange={(event) =>
              setUseCase(event.target.value)
            }
          >
            <option value="" disabled>
              Select an operational need
            </option>

            {trialRequestUseCases.map((value) => (
              <option key={value} value={value}>
                {trialRequestUseCaseLabels[value]}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>
            Estimated Users{" "}
            <span
              className="trial-request-required"
              aria-hidden="true"
            >
              *
            </span>
          </span>

          <select
            name="estimatedUsers"
            required
            defaultValue=""
          >
            <option value="" disabled>
              Select estimated users
            </option>

            {estimatedUserOptions.map((option) => (
              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {useCase === "OTHER_OPERATIONAL_WORKFLOW" && (
          <label className="trial-request-wide">
            <span>
              Describe Your Primary Operational Need{" "}
              <span
                className="trial-request-required"
                aria-hidden="true"
              >
                *
              </span>
            </span>

            <input
              name="otherUseCase"
              required
              minLength={2}
              maxLength={300}
              placeholder="Briefly describe your operational workflow"
            />
          </label>
        )}

        <label className="trial-request-wide">
          Tell Us About Your Workflow{" "}
          <span className="trial-request-optional">
            (optional)
          </span>

          <textarea
            name="workflowNotes"
            maxLength={2000}
            rows={5}
            placeholder="What operational work would you like DM3Oi to help your organization manage, coordinate, or measure?"
          />
        </label>
      </div>

      <div
        className="trial-request-honeypot"
        aria-hidden="true"
      >
        <label>
          Website Confirmation
          <input
            name="websiteConfirmation"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>

      <label className="trial-request-privacy">
        <input
          name="privacyAcknowledged"
          type="checkbox"
          required
        />

        <span>
          <span
            className="trial-request-required"
            aria-hidden="true"
          >
            *
          </span>{" "}
          I acknowledge that the information submitted
          will be used to review this trial request. See
          the{" "}
          <Link href="/privacy" target="_blank">
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      <div className="trial-request-actions">
        <PendingSubmitButton
          className="public-home-trial-button"
          pendingLabel="Submitting…"
        >
          Submit Trial Request
        </PendingSubmitButton>

        <Link
          href="/"
          className="trial-request-cancel"
        >
          Return to DM3Oi
        </Link>
      </div>
    </form>
  );
}
