pub(crate) mod cache;
mod server;

pub use cache::{cache_successful_output, init};
pub use server::start_server;

pub fn get_port() -> Option<u16> {
    server::BOUND_PORT.get().copied()
}
