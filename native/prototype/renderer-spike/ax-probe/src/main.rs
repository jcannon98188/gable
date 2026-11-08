//! PROTOTYPE (TASK-99.22, P9): AccessKit Windows adapter probe. A winit 0.31 window with a tree of
//! Window > [Button "Spike button", Label "status" (live=polite)]. Every 1.5 s the status text changes
//! (live-region update) and focus alternates between the button and the window root.
use accesskit::{ActionHandler, ActionRequest, ActivationHandler, Live, Node, NodeId, Role, TreeId, TreeInfo, TreeUpdate};
use accesskit_windows::SubclassingAdapter;
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use std::time::{Duration, Instant};
use winit::application::ApplicationHandler;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::window::{Window, WindowAttributes, WindowId};

const ROOT: NodeId = NodeId(1);
const BUTTON: NodeId = NodeId(2);
const STATUS: NodeId = NodeId(3);

fn tree(text: &str, focus: NodeId) -> TreeUpdate {
    let mut root = Node::new(Role::Window);
    root.set_label("ax-probe");
    root.set_children(vec![BUTTON, STATUS]);
    let mut b = Node::new(Role::Button);
    b.set_label("Spike button");
    b.add_action(accesskit::Action::Focus);
    let mut s = Node::new(Role::Status);
    s.set_label(text);
    s.set_live(Live::Polite);
    TreeUpdate { nodes: vec![(ROOT, root), (BUTTON, b), (STATUS, s)], tree: Some(TreeInfo::new(ROOT)), tree_id: TreeId::ROOT, focus }
}
struct Act;
impl ActivationHandler for Act {
    fn request_initial_tree(&mut self) -> Option<TreeUpdate> {
        println!("AX activation: UIA client requested the tree");
        Some(tree("status 0", ROOT))
    }
}
struct Action;
impl ActionHandler for Action {
    fn do_action(&mut self, r: ActionRequest) {
        println!("AX action from client: {:?}", r.action);
    }
}
#[derive(Default)]
struct App {
    window: Option<Box<dyn Window>>,
    adapter: Option<SubclassingAdapter>,
    n: u32,
    last: Option<Instant>,
}
impl ApplicationHandler for App {
    fn can_create_surfaces(&mut self, el: &dyn ActiveEventLoop) {
        let w = el.create_window(WindowAttributes::default().with_title("ax-probe").with_visible(false)).unwrap();
        let RawWindowHandle::Win32(h) = w.window_handle().unwrap().as_raw() else { panic!() };
        let hwnd = windows_hwnd(h.hwnd.get());
        self.adapter = Some(SubclassingAdapter::new(hwnd, Act, Action));
        w.set_visible(true);
        self.window = Some(w);
        self.last = Some(Instant::now());
        el.set_control_flow(ControlFlow::WaitUntil(Instant::now() + Duration::from_millis(500)));
    }
    fn window_event(&mut self, el: &dyn ActiveEventLoop, _: WindowId, ev: WindowEvent) {
        if let WindowEvent::CloseRequested = ev {
            el.exit();
        }
    }
    fn about_to_wait(&mut self, el: &dyn ActiveEventLoop) {
        if self.last.map_or(false, |t| t.elapsed() >= Duration::from_millis(1500)) {
            self.n += 1;
            self.last = Some(Instant::now());
            let focus = if self.n % 2 == 1 { BUTTON } else { ROOT };
            let text = format!("status {}", self.n);
            if let Some(ad) = self.adapter.as_mut() {
                let ev = ad.update_if_active(|| tree(&text, focus));
                println!("AX update n={} focus={:?} adapter_active={}", self.n, focus.0, ev.is_some());
                if let Some(e) = ev { e.raise(); }
            }
            if self.n >= 8 { el.exit(); }
        }
        el.set_control_flow(ControlFlow::WaitUntil(Instant::now() + Duration::from_millis(200)));
    }
}
type Hwnd = windows_hwnd_t::HWND;
mod windows_hwnd_t { pub use accesskit_windows::HWND; }
fn windows_hwnd(v: isize) -> Hwnd { windows_hwnd_t::HWND(v as *mut _) }
fn main() {
    EventLoop::new().unwrap().run_app(App::default()).unwrap();
}
