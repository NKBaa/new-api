/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package common

type ErrorMappingRule struct {
	Id           int    `json:"id"`
	Name         string `json:"name"`
	MatchCode    int    `json:"match_code"`    // 0 = any status code
	Keywords     string `json:"keywords"`      // comma or newline separated keywords
	ReplaceMsg   string `json:"replace_msg"`   // User-facing sanitized explanation
	OverrideCode int    `json:"override_code"` // 0 = retain upstream status code
	Enabled      bool   `json:"enabled"`
}
