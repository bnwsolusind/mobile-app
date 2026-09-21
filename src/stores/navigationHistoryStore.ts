export interface NavigationHistoryEntry {
  name: string;
  params?: Record<string, any>;
}

class NavigationHistoryManager {
  private history: NavigationHistoryEntry[] = [{ name: 'Beranda' }];
  private isNavigatingBack = false;

  pushRoute(entry: NavigationHistoryEntry) {
    if (this.isNavigatingBack) {
      this.isNavigatingBack = false;
      return;
    }

    const last = this.history[this.history.length - 1];
    if (last && last.name === entry.name) {
      if (entry.params) {
        last.params = entry.params;
      }
      return;
    }

    if (entry.name === 'Beranda' && (!entry.params || Object.keys(entry.params).length === 0)) {
      this.history = [{ name: 'Beranda' }];
      return;
    }

    this.history.push(entry);
    if (this.history.length > 25) {
      this.history = this.history.slice(-25);
    }
  }

  goBackDynamic(navigation: any, currentRouteParams?: Record<string, any>): boolean {
    if (this.history.length > 1) {
      const current = this.history.pop()!;
      const target = this.history[this.history.length - 1];
      this.isNavigatingBack = true;

      const effectiveParams = { ...(current.params || {}), ...(currentRouteParams || {}) };

      if (target.name === 'Beranda') {
        const childId = effectiveParams.child_id || effectiveParams.student_id;
        if (effectiveParams.from_child_portal && childId) {
          navigation.navigate('Beranda', {
            reopen_child_portal_id: String(childId),
            reopen_timestamp: Date.now(),
          });
          return true;
        }
      }

      navigation.navigate(target.name, target.params);
      return true;
    }

    this.isNavigatingBack = false;
    return false;
  }

  clear() {
    this.history = [{ name: 'Beranda' }];
    this.isNavigatingBack = false;
  }
}

export const navigationHistory = new NavigationHistoryManager();

// Maintain backward compatibility for getState() callers
export const useNavigationHistoryStore = {
  getState: () => navigationHistory,
};
