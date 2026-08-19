//! PowerI log file writer.
//!
//! Appends one line at a time to the PowerI log file the user can inspect
//! when reporting problems (`~/Library/Logs/PowerI/poweri.log`, or
//! `%USERPROFILE%\.poweri\poweri.log` on Windows).

use std::path::Path;

/// Append one line to the log file at `path`, creating parent directories
/// as needed. Failures are swallowed: logging must never break the app.
fn append_line(path: &Path, line: &str) {
    use std::io::Write;
    let Some(dir) = path.parent() else { return };
    if std::fs::create_dir_all(dir).is_err() {
        return;
    }
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(f, "{line}");
    }
}

/// Append one line to the PowerI log file the user can inspect when
/// reporting problems (`~/Library/Logs/PowerI/poweri.log`, or
/// `%USERPROFILE%\.poweri\poweri.log` on Windows).
pub(crate) fn log_line(line: &str) {
    let Some(home) = crate::env_detection::home_dir() else { return };
    #[cfg(windows)]
    let dir = home.join(".poweri");
    #[cfg(not(windows))]
    let dir = home.join("Library").join("Logs").join("PowerI");
    append_line(&dir.join("poweri.log"), line);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn append_line_writes_and_appends_to_log_file() {
        let dir = std::env::temp_dir().join(format!("poweri-test-log-{}", std::process::id()));
        let path = dir.join("poweri.log");
        let _ = std::fs::remove_dir_all(&dir);

        append_line(&path, "first line");
        append_line(&path, "second line");

        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("first line"));
        assert!(text.contains("second line"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn append_line_swallows_errors_for_invalid_path() {
        // A path whose parent cannot be created must not panic.
        append_line(Path::new("/dev/null/nonexistent/poweri.log"), "boom");
    }
}
