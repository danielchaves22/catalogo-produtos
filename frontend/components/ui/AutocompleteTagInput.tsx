import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { Hint } from './Hint';
import { Button } from './Button';

interface AutocompleteTagInputAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface AutocompleteTagInputProps<S, T = S> {
  label?: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  suggestions: S[];
  onSelect: (item: S) => void;
  selectedItems: T[];
  onRemove: (item: T) => void;
  getItemKey: (item: T) => string | number;
  getSuggestionKey?: (item: S) => string | number;
  renderTagLabel: (item: T) => React.ReactNode;
  renderSuggestion?: (item: S, isActive: boolean) => React.ReactNode;
  renderTag?: (item: T, onRemove: (item: T) => void) => React.ReactNode;
  isLoading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  emptyMessage?: string;
  className?: string;
  actionButton?: AutocompleteTagInputAction;
}

export function AutocompleteTagInput<S, T = S>({
  label,
  hint,
  required,
  placeholder = 'Digite para buscar...',
  searchValue,
  onSearchChange,
  suggestions,
  onSelect,
  selectedItems,
  onRemove,
  getItemKey,
  getSuggestionKey,
  renderTagLabel,
  renderSuggestion,
  renderTag,
  isLoading = false,
  disabled = false,
  icon,
  emptyMessage = 'Nenhum resultado encontrado.',
  className = '',
  actionButton,
}: AutocompleteTagInputProps<S, T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const hasSuggestions = suggestions.length > 0;
  const showEmptyState = !isLoading && isOpen && searchValue.trim().length > 0 && !hasSuggestions;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target)) {
        setIsOpen(false);
        setHasFocus(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!hasSuggestions) {
      setHighlightedIndex(-1);
      return;
    }
    setHighlightedIndex(index => {
      if (index < 0 || index >= suggestions.length) {
        return 0;
      }
      return index;
    });
  }, [hasSuggestions, suggestions.length]);

  const handleContainerClick = () => {
    if (disabled) return;
    inputRef.current?.focus();
    setIsOpen(true);
  };

  const handleInputFocus = () => {
    if (disabled) return;
    setHasFocus(true);
    setIsOpen(true);
  };

  const handleInputBlur = () => {
    setHasFocus(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!hasSuggestions) return;
      setIsOpen(true);
      setHighlightedIndex(index => (index + 1) % suggestions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!hasSuggestions) return;
      setIsOpen(true);
      setHighlightedIndex(index => {
        if (index <= 0) return suggestions.length - 1;
        return index - 1;
      });
      return;
    }

    if (event.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        event.preventDefault();
        const item = suggestions[highlightedIndex];
        onSelect(item);
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
    }

    if (event.key === 'Backspace' && searchValue.length === 0 && selectedItems.length > 0) {
      event.preventDefault();
      const lastItem = selectedItems[selectedItems.length - 1];
      onRemove(lastItem);
      return;
    }

    if (event.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }
  };

  const chips = useMemo(
    () =>
      selectedItems.map(item => {
        const key = getItemKey(item);
        if (renderTag) {
          return (
            <React.Fragment key={key}>
              {renderTag(item, onRemove)}
            </React.Fragment>
          );
        }
        return (
          <span
            key={key}
            className="flex items-center gap-1 rounded bg-gray-800 px-2 py-1 text-xs text-gray-100 border border-gray-700"
          >
            <span className="truncate max-w-[160px]">{renderTagLabel(item)}</span>
            <button
              type="button"
              onClick={() => onRemove(item)}
              className="rounded p-0.5 text-gray-400 hover:text-white"
              aria-label="Remover item"
            >
              <X size={12} />
            </button>
          </span>
        );
      }),
    [selectedItems, getItemKey, renderTagLabel, onRemove, renderTag]
  );

  return (
    <div className={`mb-4 ${className}`} ref={containerRef}>
      {label && (
        <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-300">
          {icon ?? <Search size={16} className="text-gray-400" />}
          <span>
            {label}
            {required && <span className="ml-1 text-red-400">*</span>}
          </span>
          {hint && <Hint text={hint} />}
        </label>
      )}
      <div className="flex items-stretch gap-2">
        <div
          className={`flex min-h-[44px] w-full cursor-text flex-wrap items-center gap-2 rounded-md border bg-[#1e2126] px-2 py-2 text-sm transition-colors ${
            disabled
              ? 'border-gray-800 opacity-60'
              : hasFocus
                ? 'border-blue-500 ring-1 ring-blue-500'
                : 'border-gray-700 hover:border-gray-600'
          }`}
          onClick={handleContainerClick}
          aria-disabled={disabled}
        >
          {!label && icon && <span className="text-gray-400">{icon}</span>}
          {chips}
          <input
            ref={inputRef}
            value={searchValue}
            onChange={event => onSearchChange(event.target.value)}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={selectedItems.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[140px] bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-haspopup="listbox"
          />
        </div>
        {actionButton && (
          <Button
            type="button"
            onClick={actionButton.onClick}
            disabled={disabled || actionButton.disabled}
            className="shrink-0"
          >
            {actionButton.label}
          </Button>
        )}
      </div>
      {isOpen && (
        <div className="relative">
          <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-md border border-gray-700 bg-[#1e2126] shadow-xl">
            {isLoading && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300">
                <Loader2 size={16} className="animate-spin" /> Carregando...
              </div>
            )}
            {!isLoading && hasSuggestions && (
              <div role="listbox" className="max-h-60 overflow-y-auto">
                {suggestions.map((item, index) => {
                  const key = getSuggestionKey
                    ? getSuggestionKey(item)
                    : (getItemKey(item as unknown as T) as string | number);
                  return (
                    <button
                      key={key}
                      type="button"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => {
                        onSelect(item);
                        requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      index === highlightedIndex ? 'bg-[#262b36] text-white' : 'text-gray-200 hover:bg-[#242936]'
                    }`}
                    role="option"
                    aria-selected={index === highlightedIndex}
                    >
                      {renderSuggestion
                        ? renderSuggestion(item, index === highlightedIndex)
                        : renderTagLabel(item as unknown as T)}
                    </button>
                  );
                })}
              </div>
            )}
            {showEmptyState && (
              <p className="px-3 py-2 text-sm text-gray-400">{emptyMessage}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
