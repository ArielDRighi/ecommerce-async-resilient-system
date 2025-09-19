package domain

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEmail_NewEmail(t *testing.T) {
	tests := []struct {
		name          string
		email         string
		expectedEmail string
		expectError   bool
		expectedError error
	}{
		{
			name:          "valid email",
			email:         "user@example.com",
			expectedEmail: "user@example.com",
			expectError:   false,
		},
		{
			name:          "valid email with uppercase",
			email:         "User@Example.COM",
			expectedEmail: "user@example.com",
			expectError:   false,
		},
		{
			name:          "valid email with spaces",
			email:         "  user@example.com  ",
			expectedEmail: "user@example.com",
			expectError:   false,
		},
		{
			name:        "empty email",
			email:       "",
			expectError: true,
			expectedError: ErrEmailRequired,
		},
		{
			name:        "invalid format - no @",
			email:       "userexample.com",
			expectError: true,
			expectedError: ErrInvalidEmailFormat,
		},
		{
			name:        "invalid format - no domain",
			email:       "user@",
			expectError: true,
			expectedError: ErrInvalidEmailFormat,
		},
		{
			name:        "invalid format - no local part",
			email:       "@example.com",
			expectError: true,
			expectedError: ErrInvalidEmailFormat,
		},
		{
			name:        "invalid format - no TLD",
			email:       "user@example",
			expectError: true,
			expectedError: ErrInvalidEmailFormat,
		},
		{
			name:        "too long email",
			email:       "verylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylongverylong@example.com",
			expectError: true,
			expectedError: ErrEmailTooLong,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			email, err := NewEmail(tt.email)

			if tt.expectError {
				assert.Error(t, err)
				assert.Equal(t, tt.expectedError, err)
				assert.Nil(t, email)
			} else {
				assert.NoError(t, err)
				require.NotNil(t, email)
				assert.Equal(t, tt.expectedEmail, email.Value())
				assert.Equal(t, tt.expectedEmail, email.String())
			}
		})
	}
}

func TestEmail_Domain(t *testing.T) {
	email, err := NewEmail("user@example.com")
	require.NoError(t, err)

	assert.Equal(t, "example.com", email.Domain())
}

func TestEmail_LocalPart(t *testing.T) {
	email, err := NewEmail("user@example.com")
	require.NoError(t, err)

	assert.Equal(t, "user", email.LocalPart())
}

func TestEmail_Equals(t *testing.T) {
	email1, err := NewEmail("user@example.com")
	require.NoError(t, err)

	email2, err := NewEmail("user@example.com")
	require.NoError(t, err)

	email3, err := NewEmail("other@example.com")
	require.NoError(t, err)

	assert.True(t, email1.Equals(*email2))
	assert.False(t, email1.Equals(*email3))
}