package types

import (
	"errors"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestStandardOpenAIFields(t *testing.T) {
	tests := []struct {
		code     int
		wantType string
		wantCode string
	}{
		{http.StatusBadRequest, "invalid_request_error", "invalid_request_error"},
		{http.StatusUnprocessableEntity, "invalid_request_error", "invalid_request_error"},
		{http.StatusUnauthorized, "authentication_error", "invalid_api_key"},
		{http.StatusForbidden, "permission_error", "permission_denied"},
		{http.StatusNotFound, "not_found_error", "model_not_found"},
		{http.StatusRequestEntityTooLarge, "invalid_request_error", "context_length_exceeded"},
		{http.StatusTooManyRequests, "rate_limit_error", "rate_limit_exceeded"},
		{http.StatusServiceUnavailable, "api_error", "service_unavailable"},
		{http.StatusInternalServerError, "api_error", "internal_server_error"},
	}

	for _, tt := range tests {
		gotType, gotCode := StandardOpenAIFields(tt.code)
		assert.Equal(t, tt.wantType, gotType)
		assert.Equal(t, tt.wantCode, gotCode)
	}
}

func TestStandardClaudeType(t *testing.T) {
	tests := []struct {
		code     int
		wantType string
	}{
		{http.StatusBadRequest, "invalid_request_error"},
		{http.StatusUnprocessableEntity, "invalid_request_error"},
		{http.StatusUnauthorized, "authentication_error"},
		{http.StatusForbidden, "permission_error"},
		{http.StatusNotFound, "not_found_error"},
		{http.StatusRequestEntityTooLarge, "request_too_large"},
		{http.StatusTooManyRequests, "rate_limit_error"},
		{http.StatusServiceUnavailable, "overloaded_error"},
		{529, "overloaded_error"},
		{http.StatusInternalServerError, "api_error"},
	}

	for _, tt := range tests {
		gotType := StandardClaudeType(tt.code)
		assert.Equal(t, tt.wantType, gotType)
	}
}

func TestSanitizeFields(t *testing.T) {
	apiErr := NewOpenAIError(errors.New("sensitive error with token secret"), ErrorCodeInvalidRequest, 400)
	apiErr.RelayError = OpenAIError{
		Message:  "sensitive error with token secret",
		Type:     "upstream_vendor_type",
		Param:    "internal_secret_param",
		Code:     "vendor_secret_code",
		Metadata: []byte(`{"leak":"data"}`),
	}

	apiErr.SanitizeFields(400)

	oai := apiErr.ToOpenAIError()
	assert.Equal(t, "invalid_request_error", oai.Type)
	assert.Equal(t, "invalid_request_error", oai.Code)
	assert.Equal(t, "", oai.Param)
	assert.Nil(t, oai.Metadata)

	claude := apiErr.ToClaudeError()
	assert.Equal(t, "invalid_request_error", claude.Type)
}
