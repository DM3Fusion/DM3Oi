"use client";

import { useRef, useState } from "react";
import { ApplicationIcon } from "@/components/application-icon";

const responseTypes = [
  "TEXT",
  "LONG_TEXT",
  "YES_NO",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "DATE",
  "NUMBER",
] as const;

type ResponseType = (typeof responseTypes)[number];

type InitialOption = {
  id: string;
  label: string;
  value: string;
  isActive: boolean;
};

type EditorOption = InitialOption & {
  editorKey: string;
};

export function QuestionOptionsEditor({
  initialResponseType,
  initialOptions,
  initialRequireAllOptions,
}: {
  initialResponseType: ResponseType;
  initialOptions: InitialOption[];
  initialRequireAllOptions: boolean;
}) {
  const nextKey = useRef(0);
  const [responseType, setResponseType] =
    useState<ResponseType>(initialResponseType);
  const [options, setOptions] = useState<EditorOption[]>(
    initialOptions.map((option) => ({
      ...option,
      editorKey: option.id,
    })),
  );
  const [requireAllOptions, setRequireAllOptions] = useState(
    initialRequireAllOptions,
  );

  const isSelect =
    responseType === "SINGLE_SELECT" || responseType === "MULTI_SELECT";

  const addOption = () => {
    nextKey.current += 1;
    setOptions((current) => [
      ...current,
      {
        id: "",
        label: "",
        value: "",
        isActive: true,
        editorKey: `new-${nextKey.current}`,
      },
    ]);
  };

  const updateOption = (
    editorKey: string,
    change: Partial<Pick<EditorOption, "label" | "isActive">>,
  ) => {
    setOptions((current) =>
      current.map((option) =>
        option.editorKey === editorKey ? { ...option, ...change } : option,
      ),
    );
  };

  const removeNewOption = (editorKey: string) => {
    setOptions((current) =>
      current.filter((option) => option.editorKey !== editorKey),
    );
  };

  return (
    <>
      <label>
        <span>Response type</span>
        <select
          name="responseType"
          value={responseType}
          onChange={(event) =>
            setResponseType(event.currentTarget.value as ResponseType)
          }
        >
          {responseTypes.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>

      <input
        type="hidden"
        name="requireAllOptions"
        value={
          responseType === "MULTI_SELECT" && requireAllOptions ? "on" : ""
        }
      />

      <input
        type="hidden"
        name="optionsJson"
        value={JSON.stringify(
          options.map((option, index) => ({
            id: option.id || undefined,
            label: option.label.trim(),
            value: option.value || undefined,
            is_active: option.isActive,
            display_order: index,
          })),
        )}
      />

      {responseType === "MULTI_SELECT" ? (
        <label className="checkbox-label full question-require-all-options">
          <input
            type="checkbox"
            checked={requireAllOptions}
            onChange={(event) =>
              setRequireAllOptions(event.currentTarget.checked)
            }
          />
          <span>
            Require all displayed options
            <small>
              The question is complete only after every displayed item is selected.
            </small>
          </span>
        </label>
      ) : null}

      {isSelect ? (
        <div className="full question-options-editor">
          <div className="question-options-heading">
            <div>
              <span>Selectable options</span>
              <small>
                Only items checked Display are shown when answering this question.
              </small>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={addOption}
            >
              <ApplicationIcon name="add" />
              Add Item
            </button>
          </div>

          <div className="question-options-list">
            {options.length ? (
              options.map((option) => (
                <div className="question-option-row" key={option.editorKey}>
                  <label className="checkbox-label question-option-display">
                    <input
                      type="checkbox"
                      checked={option.isActive}
                      onChange={(event) =>
                        updateOption(option.editorKey, {
                          isActive: event.currentTarget.checked,
                        })
                      }
                    />
                    <span>Display</span>
                  </label>

                  <label className="question-option-label">
                    <span className="sr-only">Option label</span>
                    <input
                      type="text"
                      required
                      value={option.label}
                      placeholder="Enter item"
                      onChange={(event) =>
                        updateOption(option.editorKey, {
                          label: event.currentTarget.value,
                        })
                      }
                    />
                  </label>

                  {option.id ? (
                    <span className="question-option-retained">
                      Retained
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => removeNewOption(option.editorKey)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="question-options-empty">
                No items configured. Add at least one item.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
