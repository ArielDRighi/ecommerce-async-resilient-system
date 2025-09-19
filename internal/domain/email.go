package domain

import (
	"regexp"
	"strings"
)

// Email represents a validated email address value object
type Email struct {
	value string
}

// NewEmail creates a new Email value object with validation
func NewEmail(email string) (*Email, error) {
	if email == "" {
		return nil, ErrEmailRequired
	}

	// Normalize email (trim spaces and convert to lowercase)
	normalized := strings.ToLower(strings.TrimSpace(email))
	
	// Validate email format using regex
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	if !emailRegex.MatchString(normalized) {
		return nil, ErrInvalidEmailFormat
	}

	// Additional business rules
	if len(normalized) > 254 { // RFC 5321 limit
		return nil, ErrEmailTooLong
	}

	return &Email{value: normalized}, nil
}

// Value returns the email string value
func (e Email) Value() string {
	return e.value
}

// String implements the Stringer interface
func (e Email) String() string {
	return e.value
}

// Equals checks if two emails are equal
func (e Email) Equals(other Email) bool {
	return e.value == other.value
}

// Domain returns the domain part of the email
func (e Email) Domain() string {
	parts := strings.Split(e.value, "@")
	if len(parts) != 2 {
		return ""
	}
	return parts[1]
}

// LocalPart returns the local part of the email (before @)
func (e Email) LocalPart() string {
	parts := strings.Split(e.value, "@")
	if len(parts) != 2 {
		return ""
	}
	return parts[0]
}