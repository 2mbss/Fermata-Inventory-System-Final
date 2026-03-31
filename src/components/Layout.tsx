import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-[220px]">
        <TopBar />
        <main className="flex-1 p-8 pt-24 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
