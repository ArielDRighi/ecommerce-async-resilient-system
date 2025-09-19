package domain

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// Currency represents a supported currency
type Currency string

const (
	USD Currency = "USD"
	EUR Currency = "EUR" 
	GBP Currency = "GBP"
	CAD Currency = "CAD"
)

// SupportedCurrencies returns a list of supported currencies
func SupportedCurrencies() []Currency {
	return []Currency{USD, EUR, GBP, CAD}
}

// IsValidCurrency checks if a currency is supported
func IsValidCurrency(currency Currency) bool {
	for _, c := range SupportedCurrencies() {
		if c == currency {
			return true
		}
	}
	return false
}

// Money represents a monetary amount with currency
type Money struct {
	amount   int64    // Amount in cents/pence to avoid floating point issues
	currency Currency
}

// NewMoney creates a new Money value object
func NewMoney(amount float64, currency Currency) (*Money, error) {
	if amount < 0 {
		return nil, ErrInvalidAmount
	}

	if !IsValidCurrency(currency) {
		return nil, ErrInvalidCurrency
	}

	// Convert to cents to avoid floating point precision issues
	cents := int64(math.Round(amount * 100))

	return &Money{
		amount:   cents,
		currency: currency,
	}, nil
}

// NewMoneyFromCents creates a new Money value object from cents
func NewMoneyFromCents(cents int64, currency Currency) (*Money, error) {
	if cents < 0 {
		return nil, ErrInvalidAmount
	}

	if !IsValidCurrency(currency) {
		return nil, ErrInvalidCurrency
	}

	return &Money{
		amount:   cents,
		currency: currency,
	}, nil
}

// Amount returns the amount as a float64
func (m Money) Amount() float64 {
	return float64(m.amount) / 100.0
}

// AmountInCents returns the amount in cents
func (m Money) AmountInCents() int64 {
	return m.amount
}

// Currency returns the currency
func (m Money) Currency() Currency {
	return m.currency
}

// String returns a formatted string representation
func (m Money) String() string {
	return fmt.Sprintf("%.2f %s", m.Amount(), m.currency)
}

// Equals checks if two Money values are equal
func (m Money) Equals(other Money) bool {
	return m.amount == other.amount && m.currency == other.currency
}

// Add adds two Money values (must be same currency)
func (m Money) Add(other Money) (*Money, error) {
	if m.currency != other.currency {
		return nil, fmt.Errorf("cannot add different currencies: %s and %s", m.currency, other.currency)
	}

	return &Money{
		amount:   m.amount + other.amount,
		currency: m.currency,
	}, nil
}

// Subtract subtracts two Money values (must be same currency)
func (m Money) Subtract(other Money) (*Money, error) {
	if m.currency != other.currency {
		return nil, fmt.Errorf("cannot subtract different currencies: %s and %s", m.currency, other.currency)
	}

	result := m.amount - other.amount
	if result < 0 {
		return nil, ErrInvalidAmount
	}

	return &Money{
		amount:   result,
		currency: m.currency,
	}, nil
}

// Multiply multiplies money by a factor
func (m Money) Multiply(factor float64) (*Money, error) {
	if factor < 0 {
		return nil, ErrInvalidAmount
	}

	result := int64(math.Round(float64(m.amount) * factor))

	return &Money{
		amount:   result,
		currency: m.currency,
	}, nil
}

// IsZero checks if the amount is zero
func (m Money) IsZero() bool {
	return m.amount == 0
}

// IsPositive checks if the amount is positive
func (m Money) IsPositive() bool {
	return m.amount > 0
}

// LessThan checks if this money is less than other
func (m Money) LessThan(other Money) (bool, error) {
	if m.currency != other.currency {
		return false, fmt.Errorf("cannot compare different currencies: %s and %s", m.currency, other.currency)
	}
	return m.amount < other.amount, nil
}

// GreaterThan checks if this money is greater than other
func (m Money) GreaterThan(other Money) (bool, error) {
	if m.currency != other.currency {
		return false, fmt.Errorf("cannot compare different currencies: %s and %s", m.currency, other.currency)
	}
	return m.amount > other.amount, nil
}

// ParseMoney parses a string like "10.50 USD" into Money
func ParseMoney(s string) (*Money, error) {
	parts := strings.Fields(strings.TrimSpace(s))
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid money format: %s (expected 'amount currency')", s)
	}

	amount, err := strconv.ParseFloat(parts[0], 64)
	if err != nil {
		return nil, fmt.Errorf("invalid amount: %s", parts[0])
	}

	currency := Currency(strings.ToUpper(parts[1]))
	
	return NewMoney(amount, currency)
}