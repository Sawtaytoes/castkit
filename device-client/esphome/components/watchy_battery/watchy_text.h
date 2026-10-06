#pragma once
#include <cstddef>
#include <string>

namespace watchy {
template <size_t N> inline void ascii_text(char (&target)[N], const std::string &source) {
  size_t written = 0;
  for (size_t i = 0; i < source.size() && written < N - 1; i++) {
    const auto ch = static_cast<unsigned char>(source[i]);
    if (ch == 0xe2 && i + 2 < source.size() && static_cast<unsigned char>(source[i + 1]) == 0x80 &&
        (static_cast<unsigned char>(source[i + 2]) == 0x98 ||
         static_cast<unsigned char>(source[i + 2]) == 0x99)) {
      target[written++] = '\'';
      i += 2;
    } else if (ch == 0xc3 && i + 1 < source.size() &&
               (static_cast<unsigned char>(source[i + 1]) == 0xa9 ||
                static_cast<unsigned char>(source[i + 1]) == 0x89)) {
      target[written++] = static_cast<unsigned char>(source[i + 1]) == 0xa9 ? 'e' : 'E';
      i++;
    } else if (ch < 128) {
      target[written++] = ch >= 32 && ch <= 126 ? ch : ' ';
    } else if ((ch & 0xc0) != 0x80) {
      target[written++] = '?';
    }
  }
}
} // namespace watchy
