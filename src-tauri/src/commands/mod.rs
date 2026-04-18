/// commands/mod.rs — command module registry
///
/// Each sub-module owns one domain. Adding a new feature = adding a new file
/// here and registering its commands in lib.rs. Nothing else changes.
pub mod csv;
pub mod settings;
pub mod sheets;
pub mod timers;
pub mod window;
