#include <nlohmann/json.hpp>
#include "libretro.h"
#include <algorithm>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>
#ifdef _WIN32
#include <windows.h>
#include <fcntl.h>
#include <io.h>
#else
#include <dlfcn.h>
#include <unistd.h>
#endif

using json = nlohmann::json;
using bytes = std::vector<uint8_t>;
constexpr size_t MAX_JSON = 1024 * 1024, MAX_BINARY = 128 * 1024 * 1024;
static bool exact_read(char* data, size_t size) { std::cin.read(data, static_cast<std::streamsize>(size)); return static_cast<size_t>(std::cin.gcount()) == size; }
static bytes read_file(const std::string& path) {
  const auto size = std::filesystem::file_size(path);
  if (size > MAX_BINARY) throw std::runtime_error("File exceeds binary budget");
  std::ifstream input(path, std::ios::binary); bytes result(size);
  if (!input || !input.read(reinterpret_cast<char*>(result.data()), static_cast<std::streamsize>(size))) throw std::runtime_error("Cannot read file");
  return result;
}
static FILE* protocol_output = nullptr;
static void write_packet(json header, const bytes& payload = {}) {
  header["binaryLength"] = payload.size(); const std::string text = header.dump();
  if (text.size() > MAX_JSON || payload.size() > MAX_BINARY) throw std::runtime_error("Response budget exceeded");
  uint32_t n = static_cast<uint32_t>(text.size()); char prefix[4];
  for (unsigned i = 0; i < 4; ++i) prefix[i] = static_cast<char>((n >> (i * 8)) & 255);
  if (fwrite(prefix, 1, 4, protocol_output) != 4 || fwrite(text.data(), 1, text.size(), protocol_output) != text.size() || (!payload.empty() && fwrite(payload.data(), 1, payload.size(), protocol_output) != payload.size()) || fflush(protocol_output)) throw std::runtime_error("Protocol write failed");
}

class Core {
public:
  void* library = nullptr;
  bool loaded = false, initialized = false, shutdown = false;
  unsigned format = RETRO_PIXEL_FORMAT_0RGB1555, width = 0, height = 0;
  size_t pitch = 0; uint64_t frame = 0, epoch = 0;
  std::string session, directory, content_path; bytes content, video, audio;
  std::vector<retro_memory_descriptor> maps;
  std::map<std::string, std::string> options;
  std::vector<uint16_t> buttons;
  retro_system_av_info av{};
  static Core* current;
  decltype(&retro_init) init = nullptr;
  decltype(&retro_deinit) deinit = nullptr;
  decltype(&retro_get_system_info) system_info = nullptr;
  decltype(&retro_get_system_av_info) av_info = nullptr;
  decltype(&retro_load_game) load = nullptr;
  decltype(&retro_unload_game) unload = nullptr;
  decltype(&retro_run) run = nullptr;
  decltype(&retro_reset) reset = nullptr;
  decltype(&retro_serialize_size) serialize_size = nullptr;
  decltype(&retro_serialize) serialize = nullptr;
  decltype(&retro_unserialize) unserialize = nullptr;
  decltype(&retro_get_memory_data) memory_data = nullptr;
  decltype(&retro_get_memory_size) memory_size = nullptr;

  template<class T> T symbol(const char* name) {
#ifdef _WIN32
    void* result = reinterpret_cast<void*>(GetProcAddress(static_cast<HMODULE>(library), name));
#else
    void* result = dlsym(library, name);
#endif
    if (!result) throw std::runtime_error(std::string("Missing libretro symbol: ") + name);
    return reinterpret_cast<T>(result);
  }
  static void log(enum retro_log_level, const char* text, ...) { va_list args; va_start(args, text); vfprintf(stderr, text, args); va_end(args); }
  static bool environment(unsigned command, void* data) {
    auto& core = *current;
    switch (command) {
      case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: core.format = *static_cast<unsigned*>(data); return core.format <= RETRO_PIXEL_FORMAT_RGB565;
      case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
      case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: *static_cast<const char**>(data) = core.directory.c_str(); return true;
      case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: static_cast<retro_log_callback*>(data)->log = log; return true;
      case RETRO_ENVIRONMENT_GET_CAN_DUPE: *static_cast<bool*>(data) = true; return true;
      case RETRO_ENVIRONMENT_GET_VARIABLE: {
        auto* variable = static_cast<retro_variable*>(data); auto it = core.options.find(variable->key);
        variable->value = it == core.options.end() ? nullptr : it->second.c_str(); return variable->value != nullptr;
      }
      case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: *static_cast<bool*>(data) = false; return true;
      case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION: *static_cast<unsigned*>(data) = 0; return true;
      case RETRO_ENVIRONMENT_SET_VARIABLES: {
        for (auto* var = static_cast<retro_variable*>(data); var && var->key; ++var) {
          if (core.options.contains(var->key) || !var->value) continue;
          std::string value(var->value); auto start = value.find(';'); if (start == std::string::npos) continue;
          value = value.substr(start + 1); while (!value.empty() && value.front() == ' ') value.erase(value.begin());
          value = value.substr(0, value.find('|')); core.options.emplace(var->key, value);
        }
        return true;
      }
      case RETRO_ENVIRONMENT_SET_MEMORY_MAPS: {
        auto* descriptors = static_cast<retro_memory_map*>(data);
        if (descriptors->num_descriptors > 4096) return false;
        core.maps.assign(descriptors->descriptors, descriptors->descriptors + descriptors->num_descriptors); return true;
      }
      case RETRO_ENVIRONMENT_SET_GEOMETRY: core.av.geometry = *static_cast<retro_game_geometry*>(data); return true;
      case RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO: core.av = *static_cast<retro_system_av_info*>(data); return true;
      case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS: return true;
      case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS:
      case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
      case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME: return true;
      case RETRO_ENVIRONMENT_SHUTDOWN: core.shutdown = true; return true;
      default: return false;
    }
  }
  static void video_callback(const void* data, unsigned w, unsigned h, size_t stride) {
    auto& core = *current; if (!data) return;
    if (data == RETRO_HW_FRAME_BUFFER_VALID) { core.shutdown = true; return; }
    const size_t pixel_size = core.format == RETRO_PIXEL_FORMAT_XRGB8888 ? 4 : 2;
    if (w > 4096 || h > 4096 || stride < w * pixel_size || stride > MAX_BINARY / std::max(1u, h)) { core.shutdown = true; return; }
    core.width = w; core.height = h; core.pitch = stride;
    auto* begin = static_cast<const uint8_t*>(data); core.video.assign(begin, begin + stride * h);
  }
  static size_t audio_callback(const int16_t* samples, size_t frames) {
    auto& core = *current; if (frames > (MAX_BINARY - core.audio.size()) / 4) { core.shutdown = true; return 0; }
    // Protocol PCM is little-endian stereo signed 16-bit, independent of host endian.
    for (size_t i = 0; i < frames * 2; ++i) { const auto sample = static_cast<uint16_t>(samples[i]); core.audio.push_back(sample & 255); core.audio.push_back(sample >> 8); }
    return frames;
  }
  static void sample_callback(int16_t left, int16_t right) { int16_t values[2] = { left, right }; audio_callback(values, 1); }
  static void input_poll() {}
  static int16_t input_state(unsigned port, unsigned device, unsigned, unsigned id) {
    if (device != RETRO_DEVICE_JOYPAD || port >= current->buttons.size()) return 0;
    if (id == RETRO_DEVICE_ID_JOYPAD_MASK) return static_cast<int16_t>(current->buttons[port]);
    return id < 16 && ((current->buttons[port] >> id) & 1);
  }
  void open(const std::string& path) {
    current = this;
#ifdef _WIN32
    library = LoadLibraryA(path.c_str());
#else
    library = dlopen(path.c_str(), RTLD_NOW | RTLD_LOCAL);
#endif
    if (!library) throw std::runtime_error("Cannot load core library");
    init = symbol<decltype(init)>("retro_init"); deinit = symbol<decltype(deinit)>("retro_deinit");
    system_info = symbol<decltype(system_info)>("retro_get_system_info"); av_info = symbol<decltype(av_info)>("retro_get_system_av_info");
    load = symbol<decltype(load)>("retro_load_game"); unload = symbol<decltype(unload)>("retro_unload_game");
    run = symbol<decltype(run)>("retro_run"); reset = symbol<decltype(reset)>("retro_reset");
    serialize_size = symbol<decltype(serialize_size)>("retro_serialize_size"); serialize = symbol<decltype(serialize)>("retro_serialize"); unserialize = symbol<decltype(unserialize)>("retro_unserialize");
    memory_data = symbol<decltype(memory_data)>("retro_get_memory_data"); memory_size = symbol<decltype(memory_size)>("retro_get_memory_size");
    symbol<decltype(&retro_set_environment)>("retro_set_environment")(environment);
    symbol<decltype(&retro_set_video_refresh)>("retro_set_video_refresh")(video_callback);
    symbol<decltype(&retro_set_audio_sample)>("retro_set_audio_sample")(sample_callback);
    symbol<decltype(&retro_set_audio_sample_batch)>("retro_set_audio_sample_batch")(audio_callback);
    symbol<decltype(&retro_set_input_poll)>("retro_set_input_poll")(input_poll);
    symbol<decltype(&retro_set_input_state)>("retro_set_input_state")(input_state);
    init(); initialized = true;
  }
  static size_t compact(size_t address, size_t disconnect) {
    size_t result = 0, bit = 1;
    for (unsigned i = 0; i < sizeof(size_t) * 8; ++i) if (!(disconnect & (size_t(1) << i))) { if (address & (size_t(1) << i)) result |= bit; bit <<= 1; }
    return result;
  }
  bytes observe(const json& range) {
    const size_t length = range.at("length").get<size_t>(), address = range.at("address").get<size_t>();
    if (length > 1024 * 1024 || address > SIZE_MAX - length) throw std::runtime_error("Invalid memory range");
    bytes result(length); const auto space = range.value("space", std::string("cpu"));
    if (space == "system" || space == "save") {
      const unsigned id = space == "system" ? RETRO_MEMORY_SYSTEM_RAM : RETRO_MEMORY_SAVE_RAM;
      auto* pointer = static_cast<uint8_t*>(memory_data(id)); const size_t size = memory_size(id);
      if (!pointer || address > size || length > size - address) throw std::runtime_error("UNSUPPORTED_MEMORY: region unavailable");
      std::copy(pointer + address, pointer + address + length, result.begin()); return result;
    }
    if (space != "cpu") throw std::runtime_error("UNSUPPORTED_MEMORY: unknown address space");
    for (size_t i = 0; i < length; ++i) {
      bool found = false; const size_t a = address + i;
      for (const auto& desc : maps) {
        if (!desc.ptr || (desc.addrspace && desc.addrspace[0]) || ((a ^ desc.start) & desc.select)) continue;
        if (!desc.select && (a < desc.start || a - desc.start >= desc.len)) continue;
        const size_t offset = compact((a & ~desc.select) - (desc.start & ~desc.select), desc.disconnect);
        if (offset >= desc.len || desc.offset > SIZE_MAX - offset) continue;
        result[i] = static_cast<const uint8_t*>(desc.ptr)[desc.offset + offset]; found = true; break;
      }
      if (!found) throw std::runtime_error("UNSUPPORTED_MEMORY: address not exposed by core");
    }
    return result;
  }
  json dispatch(const json& request, const bytes& input, bytes& output) {
    const std::string command = request.at("command"), sid = request.value("sessionId", std::string());
    const uint64_t requested_epoch = request.value("epoch", uint64_t(0)); const auto payload = request.value("payload", json::object());
    if (command == "hello") {
      if (!library) { directory = payload.value("systemDirectory", std::filesystem::current_path().string()); options = payload.value("options", std::map<std::string, std::string>()); open(payload.at("corePath")); }
      retro_system_info info{}; system_info(&info);
      return {{"protocolVersion",1},{"name",info.library_name ? info.library_name : "unknown"},{"version",info.library_version ? info.library_version : "unknown"},{"extensions",info.valid_extensions ? info.valid_extensions : ""},{"capabilities",{"frame-step","software-video","pcm","serialize","memory-maps"}}};
    }
    if (!library) throw std::runtime_error("Handshake required");
    if (command == "loadContent") {
      if (loaded) { unload(); loaded = false; }
      maps.clear(); video.clear(); audio.clear(); frame = 0; shutdown = false; format = RETRO_PIXEL_FORMAT_0RGB1555;
      session = sid; epoch = requested_epoch; content_path = payload.at("path"); content = read_file(content_path);
      retro_system_info info{}; system_info(&info);
      retro_game_info game{content_path.c_str(), info.need_fullpath ? nullptr : content.data(), info.need_fullpath ? 0 : content.size(), nullptr};
      if (!load(&game)) throw std::runtime_error("Core rejected content");
      loaded = true; av_info(&av);
      if (!(av.timing.fps > 0) || !(av.timing.sample_rate > 0)) throw std::runtime_error("Invalid core timing");
      return {{"fps",av.timing.fps},{"sampleRate",av.timing.sample_rate},{"serializeBytes",serialize_size()}};
    }
    if (!loaded) throw std::runtime_error("Content is not loaded");
    if (sid != session) throw std::runtime_error("Stale session");
    if (command == "reset" || command == "unserialize") {
      if (requested_epoch <= epoch) throw std::runtime_error("Reset/restore requires a new epoch");
      if (command == "reset") { reset(); frame = 0; }
      else { if (input.size() != serialize_size() || !unserialize(input.data(), input.size())) throw std::runtime_error("State restore rejected"); frame = payload.at("sourceFrame"); }
      epoch = requested_epoch; video.clear(); audio.clear(); return {{"sourceFrame",frame}};
    }
    if (requested_epoch != epoch) throw std::runtime_error("Stale epoch");
    if (command == "serialize") {
      const size_t size = serialize_size(); if (!size || size > MAX_BINARY) throw std::runtime_error("Serialization unsupported or too large");
      output.resize(size); if (!serialize(output.data(), size)) throw std::runtime_error("Serialization failed"); return {{"sourceFrame",frame}};
    }
    if (command == "step") {
      if (shutdown) throw std::runtime_error("Core shut down or requested unsupported rendering");
      buttons = payload.value("buttons", std::vector<uint16_t>{0}); audio.clear(); run(); ++frame;
      json segments = json::array();
      auto add = [&](const std::string& id, const bytes& data) {
        if (data.size() > MAX_BINARY - output.size()) throw std::runtime_error("Frame binary budget exceeded");
        segments.push_back({{"id",id},{"offset",output.size()},{"length",data.size()}}); output.insert(output.end(),data.begin(),data.end());
      };
      add("video", video); add("audio", audio);
      const auto ranges = payload.value("memoryRanges", json::array()); if (!ranges.is_array() || ranges.size() > 256) throw std::runtime_error("Invalid observation count");
      for (const auto& range : ranges) add(range.at("id"), observe(range));
      return {{"sourceFrame",frame},{"segments",segments},{"video",{{"width",width},{"height",height},{"pitch",pitch},{"format",format}}},{"audio",{{"sampleRate",av.timing.sample_rate},{"channels",2},{"format","s16le"}}},{"fps",av.timing.fps}};
    }
    throw std::runtime_error("Unknown command");
  }
  ~Core() { if (loaded) unload(); if (initialized) deinit();
#ifdef _WIN32
    if (library) FreeLibrary(static_cast<HMODULE>(library));
#else
    if (library) dlclose(library);
#endif
  }
};
Core* Core::current = nullptr;
int main() {
#ifdef _WIN32
  _setmode(_fileno(stdin), _O_BINARY); _setmode(_fileno(stdout), _O_BINARY);
#endif
#ifdef _WIN32
  protocol_output = _fdopen(_dup(1), "wb"); _dup2(2, 1);
#else
  protocol_output = fdopen(dup(STDOUT_FILENO), "wb"); dup2(STDERR_FILENO, STDOUT_FILENO);
#endif
  if (!protocol_output) return 1;
  Core core;
  try {
    for (;;) {
      unsigned char prefix[4]; if (!exact_read(reinterpret_cast<char*>(prefix),4)) { if (std::cin.gcount()) throw std::runtime_error("Truncated packet prefix"); break; }
      uint32_t size = 0; for (unsigned i = 0; i < 4; ++i) size |= uint32_t(prefix[i]) << (i * 8);
      if (!size || size > MAX_JSON) throw std::runtime_error("Invalid packet length");
      std::string text(size, '\0'); if (!exact_read(text.data(),size)) throw std::runtime_error("Truncated packet header");
      const auto request = json::parse(text); const auto binary_length = request.value("binaryLength",size_t(0));
      if (binary_length > MAX_BINARY) throw std::runtime_error("Binary budget exceeded");
      bytes input(binary_length), output;
      if (binary_length && !exact_read(reinterpret_cast<char*>(input.data()),binary_length)) throw std::runtime_error("Truncated packet payload");
      json response = {{"requestId",request.at("requestId")},{"sessionId",request.value("sessionId",std::string())},{"epoch",request.value("epoch",uint64_t(0))},{"protocolVersion",1}};
      try {
        if (request.value("protocolVersion",0) != 1) throw std::runtime_error("Incompatible protocol");
        if (request.at("command") == "close") { response["ok"] = true; response["result"] = json::object(); write_packet(response); break; }
        response["result"] = core.dispatch(request,input,output); response["ok"] = true;
      } catch (const std::exception& error) { response["ok"] = false; response["error"] = error.what(); output.clear(); }
      write_packet(response,output);
    }
  } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
  return 0;
}
