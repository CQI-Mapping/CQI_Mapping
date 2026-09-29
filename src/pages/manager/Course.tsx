// Manager Course page: create / edit / archive-restore courses, no delete.
// Reuses the admin Course UI with the Delete action hidden (RLS also blocks it).
import AdminCourse from '../admin/Course'

interface ManagerCourseProps {
  profile?: { email?: string | null } | null
  onNavigate?: (page: string) => void
}

function ManagerCourse({ profile }: ManagerCourseProps) {
  return <AdminCourse profile={profile} hideDelete />
}

export default ManagerCourse
