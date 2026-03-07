import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProjectList from './components/ProjectList';
import ProjectView from './components/ProjectView';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/project/:projectId" element={<ProjectView />} />
      </Routes>
    </BrowserRouter>
  );
}
