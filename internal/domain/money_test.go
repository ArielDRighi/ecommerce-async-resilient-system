package domain

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMoney_NewMoney(t *testing.T) {
	tests := []struct {
		name           string
		amount         float64
		currency       Currency
		expectedAmount float64
		expectError    bool
		expectedError  error
	}{
		{
			name:           "valid money USD",
			amount:         10.50,
			currency:       USD,
			expectedAmount: 10.50,
			expectError:    false,
		},
		{
			name:           "zero amount",
			amount:         0.0,
			currency:       USD,
			expectedAmount: 0.0,
			expectError:    false,
		},
		{
			name:        "negative amount",
			amount:      -10.50,
			currency:    USD,
			expectError: true,
			expectedError: ErrInvalidAmount,
		},
		{
			name:        "invalid currency",
			amount:      10.50,
			currency:    "XXX",
			expectError: true,
			expectedError: ErrInvalidCurrency,
		},
		{
			name:           "rounding precision",
			amount:         10.555,
			currency:       USD,
			expectedAmount: 10.56, // Should round to 2 decimal places
			expectError:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			money, err := NewMoney(tt.amount, tt.currency)

			if tt.expectError {
				assert.Error(t, err)
				assert.Equal(t, tt.expectedError, err)
				assert.Nil(t, money)
			} else {
				assert.NoError(t, err)
				require.NotNil(t, money)
				assert.Equal(t, tt.expectedAmount, money.Amount())
				assert.Equal(t, tt.currency, money.Currency())
			}
		})
	}
}

func TestMoney_NewMoneyFromCents(t *testing.T) {
	money, err := NewMoneyFromCents(1050, USD)
	require.NoError(t, err)
	
	assert.Equal(t, 10.50, money.Amount())
	assert.Equal(t, int64(1050), money.AmountInCents())
	assert.Equal(t, USD, money.Currency())
}

func TestMoney_String(t *testing.T) {
	money, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	assert.Equal(t, "10.50 USD", money.String())
}

func TestMoney_Add(t *testing.T) {
	money1, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	money2, err := NewMoney(5.25, USD)
	require.NoError(t, err)

	money3, err := NewMoney(10.00, EUR)
	require.NoError(t, err)

	// Test successful addition
	result, err := money1.Add(*money2)
	assert.NoError(t, err)
	assert.Equal(t, 15.75, result.Amount())
	assert.Equal(t, USD, result.Currency())

	// Test different currencies
	_, err = money1.Add(*money3)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "cannot add different currencies")
}

func TestMoney_Subtract(t *testing.T) {
	money1, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	money2, err := NewMoney(5.25, USD)
	require.NoError(t, err)

	money3, err := NewMoney(15.00, USD)
	require.NoError(t, err)

	money4, err := NewMoney(10.00, EUR)
	require.NoError(t, err)

	// Test successful subtraction
	result, err := money1.Subtract(*money2)
	assert.NoError(t, err)
	assert.Equal(t, 5.25, result.Amount())

	// Test negative result
	_, err = money1.Subtract(*money3)
	assert.Error(t, err)
	assert.Equal(t, ErrInvalidAmount, err)

	// Test different currencies
	_, err = money1.Subtract(*money4)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "cannot subtract different currencies")
}

func TestMoney_Multiply(t *testing.T) {
	money, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	// Test positive multiplication
	result, err := money.Multiply(2.0)
	assert.NoError(t, err)
	assert.Equal(t, 21.00, result.Amount())

	// Test zero multiplication
	result, err = money.Multiply(0.0)
	assert.NoError(t, err)
	assert.Equal(t, 0.0, result.Amount())

	// Test negative multiplication
	_, err = money.Multiply(-1.0)
	assert.Error(t, err)
	assert.Equal(t, ErrInvalidAmount, err)
}

func TestMoney_Comparisons(t *testing.T) {
	money1, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	money2, err := NewMoney(5.25, USD)
	require.NoError(t, err)

	money3, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	money4, err := NewMoney(10.50, EUR)
	require.NoError(t, err)

	// Test equals
	assert.True(t, money1.Equals(*money3))
	assert.False(t, money1.Equals(*money2))

	// Test less than
	result, err := money2.LessThan(*money1)
	assert.NoError(t, err)
	assert.True(t, result)

	result, err = money1.LessThan(*money2)
	assert.NoError(t, err)
	assert.False(t, result)

	// Test greater than
	result, err = money1.GreaterThan(*money2)
	assert.NoError(t, err)
	assert.True(t, result)

	// Test different currencies
	_, err = money1.LessThan(*money4)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "cannot compare different currencies")
}

func TestMoney_Predicates(t *testing.T) {
	zeroMoney, err := NewMoney(0.0, USD)
	require.NoError(t, err)

	positiveMoney, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	assert.True(t, zeroMoney.IsZero())
	assert.False(t, zeroMoney.IsPositive())

	assert.False(t, positiveMoney.IsZero())
	assert.True(t, positiveMoney.IsPositive())
}

func TestParseMoney(t *testing.T) {
	tests := []struct {
		name           string
		input          string
		expectedAmount float64
		expectedCurrency Currency
		expectError    bool
	}{
		{
			name:             "valid format",
			input:            "10.50 USD",
			expectedAmount:   10.50,
			expectedCurrency: USD,
			expectError:      false,
		},
		{
			name:             "lowercase currency",
			input:            "25.75 eur",
			expectedAmount:   25.75,
			expectedCurrency: EUR,
			expectError:      false,
		},
		{
			name:        "invalid format - missing currency",
			input:       "10.50",
			expectError: true,
		},
		{
			name:        "invalid format - invalid amount",
			input:       "abc USD",
			expectError: true,
		},
		{
			name:        "invalid currency",
			input:       "10.50 XXX",
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			money, err := ParseMoney(tt.input)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, money)
			} else {
				assert.NoError(t, err)
				require.NotNil(t, money)
				assert.Equal(t, tt.expectedAmount, money.Amount())
				assert.Equal(t, tt.expectedCurrency, money.Currency())
			}
		})
	}
}

func TestCurrency_IsValidCurrency(t *testing.T) {
	assert.True(t, IsValidCurrency(USD))
	assert.True(t, IsValidCurrency(EUR))
	assert.True(t, IsValidCurrency(GBP))
	assert.True(t, IsValidCurrency(CAD))
	assert.False(t, IsValidCurrency("XXX"))
}