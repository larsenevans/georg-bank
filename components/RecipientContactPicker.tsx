'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RecipientContact, PaymentDraft } from '@/types/payment';
import { normalizeIban } from '@/utils/qr';

/**
 * Props for the RecipientContactPicker component
 */
export interface RecipientContactPickerProps {
  /**
   * List of recipient contacts to display
   */
  contacts: RecipientContact[];
  
  /**
   * Currently selected contact (if any)
   */
  selectedContact?: RecipientContact | null;
  
  /**
   * Called when a contact is selected
   */
  onSelect: (contact: RecipientContact) => void;
  
  /**
   * Called when the search query changes
   */
  onSearch?: (query: string) => void;
  
  /**
   * Placeholder text for search input
   */
  searchPlaceholder?: string;
  
  /**
   * Placeholder text for empty state
   */
  emptyPlaceholder?: string;
  
  /**
   * Whether to show the "Not in contacts" option
   * @default true
   */
  showNotInContacts?: boolean;
  
  /**
   * Called when "Not in contacts" is selected
   */
  onNotInContacts?: () => void;
  
  /**
   * Maximum height of the dropdown
   * @default 300
   */
  maxHeight?: number;
  
  /**
   * Custom className for the container
   */
  className?: string;
}

/**
 * RecipientContactPicker Component
 * 
 * A searchable dropdown picker for selecting saved recipient contacts.
 * Supports keyboard navigation, debounced search, and empty states.
 */
export function RecipientContactPicker({
  contacts,
  selectedContact,
  onSelect,
  onSearch,
  searchPlaceholder = 'Search contacts...',
  emptyPlaceholder = 'No contacts found',
  showNotInContacts = true,
  onNotInContacts,
  maxHeight = 300,
  className,
}: RecipientContactPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Filter contacts based on search query
   */
  const filteredContacts = useCallback(() => {
    if (!searchQuery.trim()) {
      return contacts;
    }
    
    const query = searchQuery.toLowerCase();
    return contacts.filter(contact => 
      contact.name.toLowerCase().includes(query) ||
      contact.iban.replace(/\s+/g, '').includes(query.replace(/\s+/g, '')) ||
      (contact.bic || '').toLowerCase().includes(query)
    );
  }, [contacts, searchQuery]);

  /**
   * Format IBAN for display
   */
  const formatIban = (iban: string) => {
    return iban.replace(/(\w{4})(?=\w)/g, '$1 ');
  };

  /**
   * Handle search input change with debouncing
   */
  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchQuery(value);
    
    // Clear existing debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // Debounce search callback
    if (onSearch) {
      debounceRef.current = setTimeout(() => {
        onSearch(value);
      }, 300);
    }
  }, [onSearch]);

  /**
   * Handle contact selection
   */
  const handleSelect = useCallback((contact: RecipientContact) => {
    setIsOpen(false);
    setSearchQuery('');
    setHighlightedIndex(null);
    onSelect(contact);
  }, [onSelect]);

  /**
   * Handle input click to toggle dropdown
   */
  const handleInputClick = useCallback(() => {
    if (contacts.length > 0 || showNotInContacts) {
      setIsOpen(!isOpen);
      if (!isOpen) {
        setShowDropdown(true);
      }
    }
  }, [isOpen, contacts.length, showNotInContacts]);

  /**
   * Handle input focus
   */
  const handleFocus = useCallback(() => {
    if (contacts.length > 0 || showNotInContacts) {
      setIsOpen(true);
      setShowDropdown(true);
    }
  }, [contacts.length, showNotInContacts]);

  /**
   * Handle input blur with timeout to allow click on dropdown items
   */
  const handleBlur = useCallback(() => {
    // Use setTimeout to allow click event to fire first
    setTimeout(() => {
      setIsOpen(false);
      setShowDropdown(false);
      setHighlightedIndex(null);
    }, 200);
  }, []);

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    const filtered = filteredContacts();
    const totalItems = filtered.length + (showNotInContacts ? 1 : 0);
    
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlightedIndex(prev => {
          if (prev === null) return 0;
          return Math.min(prev + 1, totalItems - 1);
        });
        setIsOpen(true);
        setShowDropdown(true);
        break;
      
      case 'ArrowUp':
        event.preventDefault();
        setHighlightedIndex(prev => {
          if (prev === null) return totalItems - 1;
          return Math.max(prev - 1, 0);
        });
        setIsOpen(true);
        setShowDropdown(true);
        break;
      
      case 'Enter':
        event.preventDefault();
        if (highlightedIndex !== null) {
          const filtered = filteredContacts();
          if (highlightedIndex < filtered.length) {
            handleSelect(filtered[highlightedIndex]);
          } else if (showNotInContacts && onNotInContacts) {
            onNotInContacts();
            setIsOpen(false);
            setSearchQuery('');
            setHighlightedIndex(null);
          }
        }
        break;
      
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        setShowDropdown(false);
        setHighlightedIndex(null);
        if (inputRef.current) {
          inputRef.current.blur();
        }
        break;
      
      case 'Tab':
        // Don't prevent default for Tab
        break;
      
      default:
        // Clear highlighted index on other key presses
        setHighlightedIndex(null);
    }
  }, [filteredContacts, handleSelect, highlightedIndex, showNotInContacts, onNotInContacts]);

  /**
   * Handle click outside to close dropdown
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowDropdown(false);
        setHighlightedIndex(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  /**
   * Clear debounce on unmount
   */
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  /**
   * Scroll highlighted item into view
   */
  useEffect(() => {
    if (highlightedIndex !== null && isOpen && containerRef.current) {
      const items = containerRef.current.querySelectorAll('[data-contact-item]');
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }, [highlightedIndex, isOpen]);

  const filtered = filteredContacts();
  const hasResults = filtered.length > 0 || showNotInContacts;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`relative w-full cursor-text bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm transition-colors ${
          isOpen ? 'ring-2 ring-blue-500 border-blue-500' : ''
        }`}
      >
        {/* Selected contact display */}
        {selectedContact && !isOpen && (
          <div
            onClick={handleInputClick}
            className="p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer"
          >
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-blue-600 dark:text-blue-400 font-medium text-sm">
                {selectedContact.name.slice(0, 2)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {selectedContact.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {formatIban(selectedContact.iban)}
              </p>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
            </svg>
          </div>
        )}

        {/* Search input */}
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          onClick={handleInputClick}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={selectedContact && !isOpen ? '' : searchPlaceholder}
          className={`w-full p-3 pr-10 text-gray-900 dark:text-white bg-transparent placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none ${
            selectedContact && !isOpen ? 'hidden' : ''
          }`}
        />

        {/* Clear button */}
        {searchQuery && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSearchQuery('');
              if (onSearch) onSearch('');
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            aria-label="Clear search"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Dropdown menu */}
        {showDropdown && isOpen && hasResults && (
          <div
            className="absolute left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-[300px] overflow-y-auto"
            style={{ maxHeight: `${maxHeight}px` }}
          >
            {filtered.length === 0 && !showNotInContacts && (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                {emptyPlaceholder}
              </div>
            )}

            {filtered.map((contact, index) => (
              <button
                key={contact.id}
                data-contact-item
                onClick={() => handleSelect(contact)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`w-full p-3 text-left flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                  highlightedIndex === index ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-600 dark:text-blue-400 font-medium text-sm">
                    {contact.name.slice(0, 2)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {contact.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {formatIban(contact.iban)}
                  </p>
                </div>
                {contact.bic && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                    {contact.bic}
                  </span>
                )}
              </button>
            ))}

            {showNotInContacts && filtered.length > 0 && onNotInContacts && (
              <div className="border-t border-gray-200 dark:border-gray-700">
                <button
                  data-contact-item
                  onClick={onNotInContacts}
                  onMouseEnter={() => setHighlightedIndex(filtered.length)}
                  className={`w-full p-3 text-left flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                    highlightedIndex === filtered.length ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Not in contacts
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Enter recipient manually
                    </p>
                  </div>
                </button>
              </div>
            )}

            {filtered.length === 0 && showNotInContacts && onNotInContacts && (
              <button
                data-contact-item
                onClick={onNotInContacts}
                onMouseEnter={() => setHighlightedIndex(0)}
                className={`w-full p-3 text-left flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                  highlightedIndex === 0 ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Not in contacts
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Enter recipient manually
                  </p>
                </div>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Empty state when no contacts and not open */}
      {!selectedContact && contacts.length === 0 && !isOpen && (
        <div
          onClick={handleInputClick}
          className="p-3 text-gray-400 dark:text-gray-500 text-sm cursor-text hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg"
        >
          No contacts saved
        </div>
      )}
    </div>
  );
}

export default RecipientContactPicker;
