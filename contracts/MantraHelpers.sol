// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract MantraHelpers {

      // --- helpers ---
    function uintToString(uint256 v) internal pure returns (string memory) {
        if (v == 0) {
            return "0";
        }
        uint256 digits;
        uint256 tmp = v;
        while (tmp != 0) {
            digits++;
            tmp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (v != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(v % 10)));
            v /= 10;
        }
        return string(buffer);
    }

    function pad6(uint256 v) internal pure returns (string memory) {
        // returns 6-digit zero-padded string for v < 1e6
        bytes memory b = new bytes(6);
        for (uint i = 0; i < 6; i++) {
            b[5 - i] = bytes1(uint8(48 + uint8(v % 10)));
            v /= 10;
        }
        return string(b);
    }

    function formatPercentage(uint256 p) internal pure returns (string memory) {
        // p is scaled by 1e6 (1_000_000 == 100%)
        uint256 intPart = p / 1_000_000;
        uint256 frac = p % 1_000_000;
        if (frac == 0) {
            return uintToString(intPart);
        }
        string memory fracStr = pad6(frac);
        // trim trailing zeros
        bytes memory f = bytes(fracStr);
        uint256 len = f.length;
        while (len > 0 && f[len - 1] == bytes1("0")) {
            len--;
        }
        bytes memory trimmed = new bytes(len);
        for (uint i = 0; i < len; i++) trimmed[i] = f[i];
        return string(abi.encodePacked(uintToString(intPart), ".", string(trimmed)));
    }

    /**
     * @notice Convert an address to its ASCII hex string representation (0x prefixed)
     */
    function addressToString(address _addr) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";

        bytes memory str = new bytes(42);
        str[0] = "0";
        str[1] = "x";

        uint160 value = uint160(_addr);
        for (uint i = 0; i < 20; i++) {
            uint8 b = uint8(value >> (8 * (19 - i)));
            str[2 + i * 2] = alphabet[b >> 4];
            str[3 + i * 2] = alphabet[b & 0x0f];
        }

        return string(str);
    }

}
